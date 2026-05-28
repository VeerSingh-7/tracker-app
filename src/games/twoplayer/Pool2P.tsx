import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import type { TwoPlayerGameProps } from './types'
import type { AIDifficulty } from './types'
import { saveGameScore, getGameScore } from '../../db'

// ─── Physics constants ────────────────────────────────────────────────────────
const SUBSTEPS       = 3
const FRICTION       = 0.9835
const STOP_SPEED     = 0.045
const MAX_SPEED      = 22
const CUSHION_DAMPEN = 0.82
const MAX_SHOT_SPEED       = MAX_SPEED * 0.92
const TURN_CHANGE_FRAMES   = 90
const GROUP_OVERLAY_FRAMES = 120

// ─── Ball colours ─────────────────────────────────────────────────────────────
const BALL_COLOR: Record<number, string> = {
  0:'#f5f5f0',1:'#f5c518',2:'#1d4ed8',3:'#dc2626',4:'#7c3aed',
  5:'#ea580c',6:'#15803d',7:'#78350f',8:'#1a1a1a',9:'#f5c518',
  10:'#1d4ed8',11:'#dc2626',12:'#7c3aed',13:'#ea580c',14:'#15803d',15:'#78350f',
}

// ─── Types ────────────────────────────────────────────────────────────────────
type FoulReason =
  | 'scratch' | 'cue_off_table' | 'wrong_ball_first'
  | 'eight_ball_first_illegal' | 'no_rail' | 'no_contact' | 'illegal_break'

const FOUL_TEXT: Record<FoulReason, string> = {
  scratch:'Cue ball pocketed', cue_off_table:'Cue ball left the table',
  wrong_ball_first:'Wrong ball contacted first',
  eight_ball_first_illegal:'8-ball hit first on open table',
  no_rail:'No cushion contact after shot', no_contact:'No contact — air ball',
  illegal_break:'Illegal break',
}

interface Ball { id:number; x:number; y:number; vx:number; vy:number; r:number; spin:number }
interface Pocket { x:number; y:number; r:number }
interface AiShot { aimAngle:number; power:number; score:number }

type GamePhase = 'aiming'|'shooting'|'resolving'|'turnChange'|'ballInHand'|'gameOver'
type BallGroup = 'solids'|'stripes'

interface PoolState {
  w:number; h:number; balls:Ball[]; potted:number[]
  railW:number; ballR:number
  playX1:number; playX2:number; playY1:number; playY2:number
  pockets:Pocket[]; spotX:number
  headSpotY:number; footSpotY:number; centreSpotY:number; headStringY:number
  // Aiming
  aimAngle:number; aimPower:number
  aimDragging:boolean; powerDragging:boolean
  powerTouchStartY:number; powerAtDragStart:number
  // Game state
  phase:GamePhase; turn:1|2; isBreak:boolean; tableOpen:boolean
  p1Group:BallGroup|null; p2Group:BallGroup|null
  pottedThisTurn:number[]; cuePottedThisTurn:boolean
  firstBallHitId:number|null; wasOnEightAtShotStart:boolean
  turnChangeTimer:number; groupOverlayTimer:number
  railContactAfterHit:boolean; cushionsHitOnBreak:number[]
  foulReason:FoulReason|null
  pendingBallInHand:boolean; ballInHandRestricted:boolean; ballInHandDragging:boolean
  gameOver:boolean; winner:1|2|null; gameOverMsg:string
  // AI (prompt 4)
  aiThinking:boolean; aiThinkTimer:number
  aiShot:AiShot|null; aiAnimTimer:number; aiStartAngle:number
  aiPlacement:{x:number;y:number}|null
}

// ─── Layout ───────────────────────────────────────────────────────────────────
function computeLayout(W:number, H:number) {
  const railW = Math.round(Math.max(14, Math.min(22, W*0.054)))
  const ballR  = Math.max(9, Math.min(16, (W - railW*2) / 22))
  const playX1 = railW, playX2 = W-railW, playY1 = railW, playY2 = H-railW
  const playW = playX2-playX1, playH = playY2-playY1
  const spotX = playX1 + playW/2, midY = playY1 + playH/2
  const headStringY = playY1 + playH*0.25
  const headSpotY = headStringY, centreSpotY = midY
  const footSpotY = playY1 + playH*0.70
  const pocketR = ballR*1.38
  const pockets:Pocket[] = [
    {x:playX1,y:playY1,r:pocketR},{x:playX2,y:playY1,r:pocketR},
    {x:playX1,y:midY,  r:pocketR},{x:playX2,y:midY,  r:pocketR},
    {x:playX1,y:playY2,r:pocketR},{x:playX2,y:playY2,r:pocketR},
  ]
  return { railW,ballR,playX1,playX2,playY1,playY2,spotX,midY,
           headStringY,headSpotY,centreSpotY,footSpotY,pockets }
}

const RACK_ORDER = [1,2,9,3,8,10,4,11,5,12,6,13,7,14,15]

function createBalls(W:number, H:number): Ball[] {
  const L = computeLayout(W,H)
  const {ballR,spotX,footSpotY,headSpotY} = L
  const sep = ballR*2.04, balls:Ball[] = []
  let ri = 0
  for (let row=0; row<5; row++)
    for (let col=0; col<=row; col++) {
      const ox=(col-row/2)*sep, oy=row*Math.sqrt(3)*ballR+row*0.4
      balls.push({id:RACK_ORDER[ri++],x:spotX+ox,y:footSpotY+oy,vx:0,vy:0,r:ballR,spin:0})
    }
  balls.push({id:0,x:spotX,y:headSpotY,vx:0,vy:0,r:ballR,spin:0})
  return balls
}

function buildState(W:number, H:number): PoolState {
  const L = computeLayout(W,H)
  return {
    w:W,h:H,balls:createBalls(W,H),potted:[],
    railW:L.railW,ballR:L.ballR,
    playX1:L.playX1,playX2:L.playX2,playY1:L.playY1,playY2:L.playY2,
    pockets:L.pockets,spotX:L.spotX,
    headSpotY:L.headSpotY,footSpotY:L.footSpotY,
    centreSpotY:L.centreSpotY,headStringY:L.headStringY,
    aimAngle:Math.PI/2,aimPower:0.55,
    aimDragging:false,powerDragging:false,powerTouchStartY:0,powerAtDragStart:0,
    phase:'aiming',turn:1,isBreak:true,tableOpen:true,
    p1Group:null,p2Group:null,
    pottedThisTurn:[],cuePottedThisTurn:false,
    firstBallHitId:null,wasOnEightAtShotStart:false,
    turnChangeTimer:0,groupOverlayTimer:0,
    railContactAfterHit:false,cushionsHitOnBreak:[],
    foulReason:null,pendingBallInHand:false,
    ballInHandRestricted:false,ballInHandDragging:false,
    gameOver:false,winner:null,gameOverMsg:'',
    aiThinking:false,aiThinkTimer:0,aiShot:null,aiAnimTimer:0,aiStartAngle:0,aiPlacement:null,
  }
}

// ─── Physics ──────────────────────────────────────────────────────────────────
function capSpeed(b:Ball){const s2=b.vx*b.vx+b.vy*b.vy;if(s2>MAX_SPEED*MAX_SPEED){const s=MAX_SPEED/Math.sqrt(s2);b.vx*=s;b.vy*=s}}
function nearAnyPocket(b:Ball,ps:Pocket[]){const m=b.r*2;for(const p of ps){const dx=b.x-p.x,dy=b.y-p.y;if(dx*dx+dy*dy<m*m)return true}return false}

function resolveWall(b:Ball,s:PoolState){
  if(nearAnyPocket(b,s.pockets))return
  let hit=false
  if(b.x-b.r<s.playX1){b.x=s.playX1+b.r;b.vx=Math.abs(b.vx)*CUSHION_DAMPEN;hit=true}
  else if(b.x+b.r>s.playX2){b.x=s.playX2-b.r;b.vx=-Math.abs(b.vx)*CUSHION_DAMPEN;hit=true}
  if(b.y-b.r<s.playY1){b.y=s.playY1+b.r;b.vy=Math.abs(b.vy)*CUSHION_DAMPEN;hit=true}
  else if(b.y+b.r>s.playY2){b.y=s.playY2-b.r;b.vy=-Math.abs(b.vy)*CUSHION_DAMPEN;hit=true}
  if(hit){
    if(s.firstBallHitId!==null)s.railContactAfterHit=true
    if(s.isBreak&&!s.cushionsHitOnBreak.includes(b.id))s.cushionsHitOnBreak.push(b.id)
  }
}

function resolveBallPair(a:Ball,b:Ball):boolean{
  const dx=b.x-a.x,dy=b.y-a.y,dist2=dx*dx+dy*dy,minD=a.r+b.r
  if(dist2>=minD*minD||dist2<0.0001)return false
  const dist=Math.sqrt(dist2),nx=dx/dist,ny=dy/dist,overlap=(minD-dist)/2
  a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap
  const avn=a.vx*nx+a.vy*ny,bvn=b.vx*nx+b.vy*ny
  if(avn-bvn<=0)return true
  a.vx+=(bvn-avn)*nx;a.vy+=(bvn-avn)*ny;b.vx+=(avn-bvn)*nx;b.vy+=(avn-bvn)*ny
  capSpeed(a);capSpeed(b);return true
}

function updatePhysics(s:PoolState){
  for(let sub=0;sub<SUBSTEPS;sub++){
    for(const b of s.balls){b.x+=b.vx/SUBSTEPS;b.y+=b.vy/SUBSTEPS}
    const rem:number[]=[]
    for(const b of s.balls)for(const p of s.pockets){const dx=b.x-p.x,dy=b.y-p.y;if(dx*dx+dy*dy<p.r*p.r){rem.push(b.id);break}}
    if(rem.length){
      for(const id of rem){s.pottedThisTurn.push(id);s.potted.push(id);if(id===0)s.cuePottedThisTurn=true}
      s.balls=s.balls.filter(b=>!rem.includes(b.id))
    }
    for(const b of s.balls)resolveWall(b,s)
    const n=s.balls.length
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
      const hit=resolveBallPair(s.balls[i],s.balls[j])
      if(hit&&s.firstBallHitId===null){
        const ai=s.balls[i],bi=s.balls[j]
        if(ai.id===0)s.firstBallHitId=bi.id
        else if(bi.id===0)s.firstBallHitId=ai.id
      }
    }
  }
  for(const b of s.balls){b.vx*=FRICTION;b.vy*=FRICTION;if(b.vx*b.vx+b.vy*b.vy<STOP_SPEED*STOP_SPEED){b.vx=0;b.vy=0}}
}

function allStopped(s:PoolState){return s.balls.every(b=>b.vx===0&&b.vy===0)}

// ─── Game logic ───────────────────────────────────────────────────────────────
function countBallsLeft(s:PoolState,g:BallGroup){
  const ids=g==='solids'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15]
  return ids.filter(id=>s.balls.some(b=>b.id===id)).length
}
function isShooterBall(s:PoolState,id:number){
  const g=s.turn===1?s.p1Group:s.p2Group;if(!g)return false
  return g==='solids'?(id>=1&&id<=7):(id>=9&&id<=15)
}
function isValidCuePlacement(s:PoolState,x:number,y:number){
  const r=s.ballR
  if(x-r<s.playX1||x+r>s.playX2||y-r<s.playY1||y+r>s.playY2)return false
  if(s.ballInHandRestricted&&y>s.headStringY-r)return false
  for(const b of s.balls){if(b.id===0)continue;const dx=b.x-x,dy=b.y-y,md=b.r+r;if(dx*dx+dy*dy<md*md)return false}
  return true
}
function moveCueBallInHand(s:PoolState,x:number,y:number){
  let cue=s.balls.find(b=>b.id===0)
  if(!cue){cue={id:0,x:s.spotX,y:s.headSpotY,vx:0,vy:0,r:s.ballR,spin:0};s.balls.push(cue)}
  cue.x=Math.max(s.playX1+s.ballR,Math.min(s.playX2-s.ballR,x))
  cue.y=Math.max(s.playY1+s.ballR,Math.min(s.playY2-s.ballR,y))
  if(s.ballInHandRestricted)cue.y=Math.min(cue.y,s.headStringY-s.ballR)
}
function respawnCue(s:PoolState){
  s.balls=s.balls.filter(b=>b.id!==0);s.potted=s.potted.filter(id=>id!==0)
  const y=s.ballInHandRestricted?(s.playY1+s.headStringY)/2:s.centreSpotY
  s.balls.push({id:0,x:s.spotX,y,vx:0,vy:0,r:s.ballR,spin:0})
}
function passTurn(s:PoolState){s.turn=s.turn===1?2:1;s.turnChangeTimer=TURN_CHANGE_FRAMES;s.phase='turnChange'}
function assignGroups(s:PoolState,pts:number[]){
  if(!s.tableOpen||pts.length===0)return
  const g:BallGroup=(pts[0]>=1&&pts[0]<=7)?'solids':'stripes'
  if(s.turn===1){s.p1Group=g;s.p2Group=g==='solids'?'stripes':'solids'}
  else{s.p2Group=g;s.p1Group=g==='solids'?'stripes':'solids'}
  s.tableOpen=false;s.groupOverlayTimer=GROUP_OVERLAY_FRAMES
}
function resetToBreak(s:PoolState){
  s.balls=createBalls(s.w,s.h);s.potted=[]
  s.turn=(s.turn===1?2:1)as 1|2;s.isBreak=true;s.tableOpen=true
  s.p1Group=null;s.p2Group=null;s.pottedThisTurn=[];s.cuePottedThisTurn=false
  s.firstBallHitId=null;s.wasOnEightAtShotStart=false;s.railContactAfterHit=false;s.cushionsHitOnBreak=[]
  s.foulReason=null;s.pendingBallInHand=false;s.ballInHandRestricted=false;s.ballInHandDragging=false
  s.gameOver=false;s.winner=null;s.gameOverMsg=''
  s.turnChangeTimer=TURN_CHANGE_FRAMES;s.phase='turnChange';s.groupOverlayTimer=0
  s.aimAngle=Math.PI/2;s.aimPower=0.55;s.aimDragging=false;s.powerDragging=false
  s.aiThinking=false;s.aiThinkTimer=0;s.aiShot=null;s.aiAnimTimer=0;s.aiPlacement=null
}

function detectFoul(s:PoolState,fh:number|null,onEight:boolean,sg:BallGroup|null,ncp:number[]):FoulReason|null{
  if(s.cuePottedThisTurn)return'scratch'
  if(fh===null)return'no_contact'
  if(s.tableOpen){if(fh===8)return'eight_ball_first_illegal'}
  else if(sg!==null){
    if(onEight){if(fh!==8)return'wrong_ball_first'}
    else{const own=sg==='solids'?(fh>=1&&fh<=7):(fh>=9&&fh<=15);if(!own)return'wrong_ball_first'}
  }
  if(!s.railContactAfterHit&&ncp.length===0&&!s.pottedThisTurn.includes(8))return'no_rail'
  return null
}

function endGame(s:PoolState,w:'p1'|'p2',msg:string,trigger:()=>void,onGameEnd?:(w:'p1'|'p2'|'draw')=>void){
  s.phase='gameOver';s.gameOver=true;s.winner=w==='p1'?1:2;s.gameOverMsg=msg
  trigger();onGameEnd?.(w)
}

function resolveTurn(s:PoolState,trigger:()=>void,onGameEnd?:(w:'p1'|'p2'|'draw')=>void){
  const pts=[...s.pottedThisTurn],e8=pts.includes(8),ncp=pts.filter(id=>id!==0&&id!==8)
  const fh=s.firstBallHitId,sg=s.turn===1?s.p1Group:s.p2Group,onEight=s.wasOnEightAtShotStart
  const sl=`P${s.turn}`,ol=`P${s.turn===1?2:1}`

  if(s.isBreak){
    s.isBreak=false
    if(e8){resetToBreak(s);trigger();return}
    if(s.cuePottedThisTurn){respawnCue(s);s.foulReason='scratch';s.pendingBallInHand=true;s.ballInHandRestricted=true;passTurn(s);trigger();return}
    const legal=s.cushionsHitOnBreak.length>=4||ncp.length>0
    if(!legal){s.foulReason='illegal_break';s.pendingBallInHand=true;s.ballInHandRestricted=true;passTurn(s);trigger();return}
    if(ncp.length>0){s.phase='aiming';trigger();return}
    passTurn(s);trigger();return
  }

  if(e8){
    if(s.cuePottedThisTurn){endGame(s,s.turn===1?'p2':'p1',`${sl} scratched on the 8-ball — ${ol} wins!`,trigger,onGameEnd);return}
    const fe=detectFoul(s,fh,onEight,sg,ncp)
    if(fe!==null){endGame(s,s.turn===1?'p2':'p1',`${sl} fouled on the 8-ball — ${ol} wins!`,trigger,onGameEnd);return}
    if(!onEight){endGame(s,s.turn===1?'p2':'p1',`${sl} pocketed the 8-ball early — ${ol} wins!`,trigger,onGameEnd);return}
    endGame(s,s.turn===1?'p1':'p2',`${sl} cleared ${sg??'their group'} and sank the 8-ball!`,trigger,onGameEnd);return
  }

  const foul=detectFoul(s,fh,onEight,sg,ncp)
  if(foul!==null){
    if(s.tableOpen&&ncp.length>0)assignGroups(s,ncp)
    if(s.cuePottedThisTurn)respawnCue(s)
    s.foulReason=foul;s.pendingBallInHand=true;s.ballInHandRestricted=false
    passTurn(s);trigger();return
  }

  if(s.tableOpen&&ncp.length>0)assignGroups(s,ncp)
  if(ncp.some(id=>isShooterBall(s,id))){s.phase='aiming';trigger()}
  else{passTurn(s);trigger()}
}

// ─── AI helpers ───────────────────────────────────────────────────────────────
function isPathBlocked(x1:number,y1:number,x2:number,y2:number,balls:Ball[],r:number,skipId:number):boolean{
  const dx=x2-x1,dy=y2-y1,len=Math.sqrt(dx*dx+dy*dy)
  if(len<1)return false
  const nx=dx/len,ny=dy/len
  for(const b of balls){
    if(b.id===0||b.id===skipId)continue
    const ax=b.x-x1,ay=b.y-y1,t=ax*nx+ay*ny
    if(t<r||t>len-r)continue
    const px=x1+t*nx,py=y1+t*ny,d2=(px-b.x)**2+(py-b.y)**2,md=r+b.r
    if(d2<md*md*0.82)return true
  }
  return false
}

function computeSafetyShot(balls:Ball[],targetBalls:Ball[],cue:Ball,diff:AIDifficulty):AiShot{
  let nearest=targetBalls[0],nd=Infinity
  for(const b of targetBalls){const d=Math.sqrt((b.x-cue.x)**2+(b.y-cue.y)**2);if(d<nd){nd=d;nearest=b}}
  const a=Math.atan2(nearest.y-cue.y,nearest.x-cue.x)
  const n=diff==='easy'?(Math.random()-0.5)*0.3:(Math.random()-0.5)*0.1
  void balls
  return{aimAngle:a+n,power:0.28+Math.random()*0.18,score:-50}
}

function computeAiShot(s:PoolState,diff:AIDifficulty):AiShot|null{
  const cue=s.balls.find(b=>b.id===0);if(!cue)return null
  const ag=s.p2Group
  const onEight=!s.tableOpen&&ag!==null&&countBallsLeft(s,ag)===0
  let targets:Ball[]
  if(onEight)targets=s.balls.filter(b=>b.id===8)
  else if(s.tableOpen)targets=s.balls.filter(b=>b.id!==0&&b.id!==8)
  else if(ag)targets=ag==='solids'?s.balls.filter(b=>b.id>=1&&b.id<=7):s.balls.filter(b=>b.id>=9&&b.id<=15)
  else targets=s.balls.filter(b=>b.id!==0&&b.id!==8)
  if(targets.length===0)return null

  // Break: special case
  if(s.isBreak){
    const apex=s.balls.find(b=>b.id===1)
    const ba=apex?Math.atan2(apex.y-cue.y,apex.x-cue.x):Math.PI/2
    const bn=diff==='easy'?(Math.random()-0.5)*0.15:(Math.random()-0.5)*0.05
    return{aimAngle:ba+bn,power:0.8+Math.random()*0.15,score:100}
  }

  type C={aimAngle:number;power:number;score:number}
  const cands:C[]=[]

  for(const target of targets){
    for(const p of s.pockets){
      const tpDx=p.x-target.x,tpDy=p.y-target.y
      const tpDist=Math.sqrt(tpDx*tpDx+tpDy*tpDy)
      if(tpDist<target.r)continue
      const tpNx=tpDx/tpDist,tpNy=tpDy/tpDist
      const ghostX=target.x-tpNx*(cue.r+target.r),ghostY=target.y-tpNy*(cue.r+target.r)
      const cgDx=ghostX-cue.x,cgDy=ghostY-cue.y,cgDist=Math.sqrt(cgDx*cgDx+cgDy*cgDy)
      if(cgDist<1)continue
      const aimAngle=Math.atan2(cgDy,cgDx)

      // Cut angle
      const c2b=Math.atan2(target.y-cue.y,target.x-cue.x)
      const b2p=Math.atan2(tpDy,tpDx)
      let cut=Math.abs(b2p-c2b);if(cut>Math.PI)cut=2*Math.PI-cut
      const cutDeg=cut*(180/Math.PI);if(cutDeg>82)continue

      const cp=isPathBlocked(cue.x,cue.y,ghostX,ghostY,s.balls,cue.r,target.id)
      if(cp&&diff!=='easy')continue
      const bp=isPathBlocked(target.x,target.y,p.x,p.y,s.balls,target.r,target.id)
      if(bp)continue

      let score=95-cutDeg*1.1-cgDist*0.08-tpDist*0.05
      if(cp)score-=35
      const basePower=Math.max(0.25,Math.min(0.88,(cgDist+tpDist)/520))
      cands.push({aimAngle,power:basePower,score})
    }
  }

  if(cands.length===0)return computeSafetyShot(s.balls,targets,cue,diff)
  cands.sort((a,b)=>b.score-a.score)
  const best=cands[0]

  const aN=diff==='easy'?(Math.random()-0.5)*0.52:diff==='medium'?(Math.random()-0.5)*0.17:(Math.random()-0.5)*0.052
  const pN=diff==='easy'?(Math.random()-0.5)*0.80:diff==='medium'?(Math.random()-0.5)*0.40:(Math.random()-0.5)*0.20
  return{aimAngle:best.aimAngle+aN,power:Math.max(0.1,Math.min(1,best.power+pN)),score:best.score}
}

function computeAiBallInHandPlacement(s:PoolState,diff:AIDifficulty):{x:number;y:number}{
  let bestScore=-Infinity,bestPos={x:s.spotX,y:s.centreSpotY}
  for(let i=0;i<22;i++){
    const x=s.playX1+s.ballR*2+Math.random()*(s.playX2-s.playX1-s.ballR*4)
    const maxY=s.ballInHandRestricted?s.headStringY-s.ballR*2:s.playY2-s.ballR*2
    const y=s.playY1+s.ballR*2+Math.random()*(maxY-s.playY1-s.ballR*2)
    if(!isValidCuePlacement(s,x,y))continue
    const tempCue:Ball={id:0,x,y,vx:0,vy:0,r:s.ballR,spin:0}
    const tempState:PoolState={...s,balls:[...s.balls.filter(b=>b.id!==0),tempCue]}
    const shot=computeAiShot(tempState,'hard')
    if(shot&&shot.score>bestScore){bestScore=shot.score;bestPos={x,y}}
  }
  void diff
  return bestPos
}

// ─── Ray-cast helpers ─────────────────────────────────────────────────────────
function rayCushionDist(cx:number,cy:number,angle:number,s:PoolState,r:number){
  const dx=Math.cos(angle),dy=Math.sin(angle),ts:number[]=[]
  if(Math.abs(dx)>0.001){ts.push((s.playX1+r-cx)/dx);ts.push((s.playX2-r-cx)/dx)}
  if(Math.abs(dy)>0.001){ts.push((s.playY1+r-cy)/dy);ts.push((s.playY2-r-cy)/dy)}
  const valid=ts.filter(t=>t>r*0.1);return valid.length?Math.min(...valid):800
}
function rayBallInfo(cx:number,cy:number,angle:number,balls:Ball[],cueR:number){
  const dx=Math.cos(angle),dy=Math.sin(angle);let md=Infinity,hitId:number|null=null
  for(const b of balls){
    if(b.id===0)continue
    const ax=b.x-cx,ay=b.y-cy,t=ax*dx+ay*dy;if(t<cueR)continue
    const px=cx+t*dx,py=cy+t*dy,d2=(px-b.x)**2+(py-b.y)**2,rS=cueR+b.r
    if(d2<rS*rS){const d=t-Math.sqrt(Math.max(0,rS*rS-d2));if(d>0&&d<md){md=d;hitId=b.id}}
  }
  return{dist:md,ballId:hitId}
}

// ─── Rendering ────────────────────────────────────────────────────────────────
function drawTable(ctx:CanvasRenderingContext2D,s:PoolState){
  const{w:W,h:H,playX1,playX2,playY1,playY2,pockets,ballR}=s
  const rg=ctx.createLinearGradient(0,0,W,0);rg.addColorStop(0,'#6b3a1f');rg.addColorStop(0.5,'#8B4513');rg.addColorStop(1,'#6b3a1f')
  ctx.fillStyle=rg;ctx.fillRect(0,0,W,H)
  ctx.strokeStyle='rgba(255,200,120,0.18)';ctx.lineWidth=1;ctx.strokeRect(2,2,W-4,H-4)
  const fg=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.65)
  fg.addColorStop(0,'#0d6b32');fg.addColorStop(0.6,'#0a5a2a');fg.addColorStop(1,'#084a22')
  ctx.fillStyle=fg;ctx.fillRect(playX1,playY1,playX2-playX1,playY2-playY1)
  ctx.strokeStyle='rgba(0,0,0,0.04)';ctx.lineWidth=1
  for(let y=playY1;y<playY2;y+=4){ctx.beginPath();ctx.moveTo(playX1,y);ctx.lineTo(playX2,y);ctx.stroke()}
  ctx.strokeStyle='rgba(30,160,70,0.4)';ctx.lineWidth=2
  ctx.strokeRect(playX1+1,playY1+1,playX2-playX1-2,playY2-playY1-2)
  const sR=ballR*0.12,dot=(x:number,y:number)=>{ctx.beginPath();ctx.arc(x,y,sR,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fill()}
  dot(s.spotX,s.headSpotY);dot(s.spotX,s.centreSpotY);dot(s.spotX,s.footSpotY)
  ctx.setLineDash([4,5]);ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=1
  ctx.beginPath();ctx.moveTo(playX1+2,s.headStringY);ctx.lineTo(playX2-2,s.headStringY);ctx.stroke();ctx.setLineDash([])
  for(const p of pockets){
    ctx.beginPath();ctx.arc(p.x,p.y,p.r+3,0,Math.PI*2);ctx.fillStyle='#2a1a0a';ctx.fill()
    const pg=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r)
    pg.addColorStop(0,'#111');pg.addColorStop(1,'#000')
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=pg;ctx.fill()
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.strokeStyle='rgba(100,60,20,0.6)';ctx.lineWidth=1.5;ctx.stroke()
  }
}

function drawKitchen(ctx:CanvasRenderingContext2D,s:PoolState){
  ctx.fillStyle='rgba(255,220,50,0.07)';ctx.fillRect(s.playX1,s.playY1,s.playX2-s.playX1,s.headStringY-s.playY1)
  ctx.setLineDash([6,5]);ctx.strokeStyle='rgba(255,220,50,0.45)';ctx.lineWidth=2
  ctx.beginPath();ctx.moveTo(s.playX1+2,s.headStringY);ctx.lineTo(s.playX2-2,s.headStringY);ctx.stroke();ctx.setLineDash([])
  ctx.font=`bold ${Math.max(9,s.ballR*0.7)}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle'
  ctx.fillStyle='rgba(255,220,50,0.45)';ctx.fillText('KITCHEN',s.spotX,(s.playY1+s.headStringY)/2)
}

function lighten(h:string,t:number){return blendToward(h,'#ffffff',t)}
function darken(h:string,t:number){return blendToward(h,'#000000',t)}
function blendToward(hex:string,target:string,t:number):string{
  const p=(h:string,i:number)=>parseInt(h.replace('#','').slice(i,i+2),16)
  const r1=p(hex,0),g1=p(hex,2),b1=p(hex,4),r2=p(target,0),g2=p(target,2),b2=p(target,4)
  const l=(a:number,b:number)=>Math.round(a+(b-a)*t)
  return`rgb(${l(r1,r2)},${l(g1,g2)},${l(b1,b2)})`
}

function drawBall(ctx:CanvasRenderingContext2D,b:Ball){
  const{x,y,r,id,spin}=b,isSt=id>=9&&id<=15,isCue=id===0
  ctx.beginPath();ctx.ellipse(x+1.5,y+2.5,r*0.88,r*0.4,0,0,Math.PI*2);ctx.fillStyle='rgba(0,0,0,0.28)';ctx.fill()
  ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.clip()
  if(isCue){
    const g=ctx.createRadialGradient(x-r*0.28,y-r*0.28,r*0.05,x,y,r)
    g.addColorStop(0,'#ffffff');g.addColorStop(0.7,'#e8edf2');g.addColorStop(1,'#c8d0d8')
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)
    ctx.save();ctx.translate(x,y);ctx.rotate(spin);ctx.beginPath();ctx.arc(r*0.42,0,r*0.12,0,Math.PI*2);ctx.fillStyle='rgba(180,30,30,0.55)';ctx.fill();ctx.restore()
  }else if(isSt){
    ctx.fillStyle='#f5f5f2';ctx.fillRect(x-r,y-r,r*2,r*2)
    ctx.save();ctx.translate(x,y);ctx.rotate(spin);ctx.fillStyle=BALL_COLOR[id];ctx.fillRect(-r,-r*0.41,r*2,r*0.82);ctx.restore()
  }else{
    const g=ctx.createRadialGradient(x-r*0.3,y-r*0.32,r*0.04,x,y,r),col=BALL_COLOR[id]
    g.addColorStop(0,lighten(col,0.45));g.addColorStop(0.5,col);g.addColorStop(1,darken(col,0.3))
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2)
  }
  ctx.beginPath();ctx.ellipse(x-r*0.28,y-r*0.3,r*0.24,r*0.14,-0.4,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.55)';ctx.fill()
  ctx.restore()
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.strokeStyle=isCue?'rgba(180,190,200,0.5)':'rgba(0,0,0,0.35)';ctx.lineWidth=0.8;ctx.stroke()
  if(!isCue){
    const dR=r*0.40;ctx.save();ctx.translate(x,y);ctx.rotate(spin)
    ctx.beginPath();ctx.arc(0,0,dR,0,Math.PI*2);ctx.fillStyle=id===8?'#1a1a1a':'#f8f8f5';ctx.fill()
    ctx.strokeStyle='rgba(0,0,0,0.2)';ctx.lineWidth=0.5;ctx.stroke()
    const fs=Math.max(6,r*0.48);ctx.font=`bold ${fs}px "Arial Narrow",Arial,sans-serif`
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=id===8?'#ffffff':'#111111'
    ctx.fillText(String(id),0,fs*0.04);ctx.restore()
  }
}

function drawAimSystem(ctx:CanvasRenderingContext2D,s:PoolState,cue:Ball){
  const{aimAngle,aimPower}=s,{x:cx,y:cy,r}=cue
  const dx=Math.cos(aimAngle),dy=Math.sin(aimAngle)
  const{dist:bd,ballId}=rayBallInfo(cx,cy,aimAngle,s.balls,r)
  const cd=rayCushionDist(cx,cy,aimAngle,s,r),dist=Math.min(bd,cd)
  const ex=cx+dx*dist,ey=cy+dy*dist
  ctx.setLineDash([7,6]);ctx.strokeStyle='rgba(255,255,255,0.30)';ctx.lineWidth=1.5
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([])
  if(ballId!==null){ctx.beginPath();ctx.arc(ex,ey,r,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,0.12)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.35)';ctx.lineWidth=1;ctx.stroke()}
  const pull=r*1.2+aimPower*r*2,sl=r*7.5
  const tx=cx-dx*pull,ty=cy-dy*pull,bx=tx-dx*sl,by=ty-dy*sl
  const tw=r*0.12,bw=r*0.4,px=-dy,py=dx
  ctx.beginPath();ctx.moveTo(tx+px*tw,ty+py*tw);ctx.lineTo(tx-px*tw,ty-py*tw);ctx.lineTo(bx-px*bw,by-py*bw);ctx.lineTo(bx+px*bw,by+py*bw);ctx.closePath()
  const cg=ctx.createLinearGradient(tx,ty,bx,by)
  cg.addColorStop(0,'#e8c870');cg.addColorStop(0.25,'#b07830');cg.addColorStop(0.75,'#6b3a18');cg.addColorStop(1,'#3a1a08')
  ctx.fillStyle=cg;ctx.fill();ctx.strokeStyle='rgba(0,0,0,0.5)';ctx.lineWidth=0.5;ctx.stroke()
}

function drawPowerBar(ctx:CanvasRenderingContext2D,s:PoolState,W:number,H:number,pzx:number){
  const bW=10,bH=(s.playY2-s.playY1)*0.48,bX=pzx+(W-pzx-bW)/2,bY=(H-bH)/2
  ctx.beginPath();ctx.roundRect(bX,bY,bW,bH,5);ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fill();ctx.strokeStyle='rgba(255,255,255,0.18)';ctx.lineWidth=1;ctx.stroke()
  const fH=bH*s.aimPower
  if(fH>0){
    const fY=bY+bH-fH;ctx.save();ctx.beginPath();ctx.roundRect(bX,bY,bW,bH,5);ctx.clip()
    const fg=ctx.createLinearGradient(0,fY+fH,0,fY);fg.addColorStop(0,'#22c55e');fg.addColorStop(0.5,'#f59e0b');fg.addColorStop(1,'#ef4444')
    ctx.fillStyle=fg;ctx.fillRect(bX,fY,bW,fH);ctx.restore()
  }
  const kY=bY+bH*(1-s.aimPower)-4;ctx.beginPath();ctx.roundRect(bX-3,kY,bW+6,8,4);ctx.fillStyle='#ffffff';ctx.fill()
  ctx.font=`bold ${Math.max(8,bW*0.9)}px Arial`;ctx.textAlign='center';ctx.fillStyle='rgba(255,255,255,0.55)'
  ctx.textBaseline='bottom';ctx.fillText('PWR',bX+bW/2,bY-4);ctx.textBaseline='top';ctx.fillText(`${Math.round(s.aimPower*100)}%`,bX+bW/2,bY+bH+4)
}

function drawOverlay(ctx:CanvasRenderingContext2D,s:PoolState,W:number,H:number,c1:string,c2:string){
  if(s.phase==='turnChange'&&s.turnChangeTimer>0){
    const al=Math.min(1,s.turnChangeTimer/20)*0.82;ctx.fillStyle=`rgba(0,0,0,${al})`;ctx.fillRect(0,0,W,H)
    ctx.textAlign='center';ctx.textBaseline='middle'
    const sh=!!s.foulReason,shift=sh?W*0.04:0
    if(s.foulReason){
      ctx.font=`bold ${Math.round(W*0.06)}px Arial`;ctx.fillStyle='#ef4444';ctx.shadowColor='#ef4444';ctx.shadowBlur=14
      ctx.fillText('⚠ FOUL',W/2,H/2-W*0.13);ctx.shadowBlur=0
      ctx.font=`${Math.round(W*0.037)}px Arial`;ctx.fillStyle='rgba(255,160,160,0.9)'
      ctx.fillText(FOUL_TEXT[s.foulReason],W/2,H/2-W*0.065)
    }
    const pc=s.turn===1?c1:c2;ctx.font=`bold ${Math.round(W*0.07)}px Arial`;ctx.fillStyle=pc;ctx.shadowColor=pc;ctx.shadowBlur=18
    ctx.fillText(`Player ${s.turn}'s Turn`,W/2,H/2+shift);ctx.shadowBlur=0
    if(!s.tableOpen&&(s.turn===1?s.p1Group:s.p2Group)){
      const grp=(s.turn===1?s.p1Group:s.p2Group)!.toUpperCase()
      ctx.font=`${Math.round(W*0.04)}px Arial`;ctx.fillStyle='rgba(255,255,255,0.6)';ctx.fillText(grp,W/2,H/2+shift+W*0.09)
    }
    if(s.pendingBallInHand){ctx.font=`${Math.round(W*0.038)}px Arial`;ctx.fillStyle='#f5c518';ctx.fillText(s.ballInHandRestricted?'Ball in hand (kitchen only)':'Ball in hand — place anywhere',W/2,H/2+shift+W*0.16)}
  }
  if(s.groupOverlayTimer>0){
    const fade=Math.min(1,s.groupOverlayTimer/20);ctx.fillStyle=`rgba(0,0,0,${fade*0.7})`;ctx.fillRect(0,0,W,H)
    const fs=Math.round(W*0.055);ctx.font=`bold ${fs}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle'
    ctx.fillStyle=`rgba(255,255,255,${fade})`;ctx.fillText('Groups Assigned!',W/2,H/2-fs*1.6)
    ctx.fillStyle=c1;ctx.fillText(`P1: ${(s.p1Group??'').toUpperCase()}`,W/2,H/2-fs*0.3)
    ctx.fillStyle=c2;ctx.fillText(`P2: ${(s.p2Group??'').toUpperCase()}`,W/2,H/2+fs*1.1)
    s.groupOverlayTimer--
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Pool2P({mode='2p',difficulty='medium',p1Color='red',onBack,onGameEnd}:TwoPlayerGameProps){
  const canvasRef   =useRef<HTMLCanvasElement>(null)
  const stateRef    =useRef<PoolState|null>(null)
  const onGameEndRef=useRef(onGameEnd)
  const savedRef    =useRef(false)
  const [tick,setTick]=useState(0)
  const triggerUi=useCallback(()=>setTick(t=>t+1),[])

  useEffect(()=>{onGameEndRef.current=onGameEnd},[onGameEnd])

  // Save score on game over
  useEffect(()=>{
    const gs=stateRef.current
    if(gs?.gameOver&&gs.winner&&!savedRef.current){
      savedRef.current=true
      const w=gs.winner
      if(mode==='ai'){
        const key=`pool_ai_${difficulty}`
        getGameScore(key).then(ex=>{
          const base=ex??{gameId:key,bestScore:0,lastPlayed:''}
          saveGameScore({gameId:key,bestScore:base.bestScore+(w===1?1:0),lastPlayed:new Date().toISOString(),
            extra:{gamesPlayed:((base.extra?.gamesPlayed as number)??0)+1}})
        })
      }else{
        getGameScore('pool_2p').then(ex=>{
          const base=ex??{gameId:'pool_2p',bestScore:0,lastPlayed:''}
          saveGameScore({gameId:'pool_2p',bestScore:base.bestScore+(w===1?1:0),lastPlayed:new Date().toISOString(),
            extra:{...(base.extra??{}),gamesPlayed:((base.extra?.gamesPlayed as number)??0)+1,p2Wins:(((base.extra?.p2Wins as number)??0)+(w===2?1:0))}})
        })
      }
    }
  },[tick,mode,difficulty])

  const handleShoot=useCallback(()=>{
    const s=stateRef.current;if(!s||s.phase!=='aiming')return
    const cue=s.balls.find(b=>b.id===0);if(!cue)return
    const speed=Math.max(0.08,s.aimPower)*MAX_SHOT_SPEED
    cue.vx=Math.cos(s.aimAngle)*speed;cue.vy=Math.sin(s.aimAngle)*speed
    s.phase='shooting';s.pottedThisTurn=[];s.cuePottedThisTurn=false
    s.firstBallHitId=null;s.railContactAfterHit=false;s.cushionsHitOnBreak=[];s.foulReason=null
    const sg=s.turn===1?s.p1Group:s.p2Group
    s.wasOnEightAtShotStart=!s.tableOpen&&sg!==null&&countBallsLeft(s,sg)===0
    triggerUi()
  },[triggerUi])

  const handlePlaceBall=useCallback(()=>{
    const s=stateRef.current;if(!s||s.phase!=='ballInHand')return
    const cue=s.balls.find(b=>b.id===0);if(!cue||!isValidCuePlacement(s,cue.x,cue.y))return
    s.phase='aiming';s.ballInHandDragging=false;s.pendingBallInHand=false;s.ballInHandRestricted=false;s.foulReason=null
    triggerUi()
  },[triggerUi])

  const handlePlayAgain=useCallback(()=>{
    savedRef.current=false
    const s=stateRef.current;if(!s)return
    stateRef.current=buildState(s.w,s.h);triggerUi()
  },[triggerUi])

  const c1=p1Color==='red'?'#ef4444':'#3b82f6'
  const c2=p1Color==='red'?'#3b82f6':'#ef4444'
  const isAiMode=mode==='ai'

  const gs=stateRef.current
  const phase=gs?.phase??'aiming',turn=gs?.turn??1
  const p1Group=gs?.p1Group??null,p2Group=gs?.p2Group??null
  const tableOpen=gs?.tableOpen??true,isBreak=gs?.isBreak??true
  const foulReason=gs?.foulReason??null,bihRestricted=gs?.ballInHandRestricted??false
  const gameWinner=gs?.winner??null,gameOverMsg=gs?.gameOverMsg??''
  const p1Left=gs&&p1Group?countBallsLeft(gs,p1Group):7
  const p2Left=gs&&p2Group?countBallsLeft(gs,p2Group):7
  const p1OnEight=!tableOpen&&p1Group!==null&&gs?countBallsLeft(gs,p1Group)===0:false
  const p2OnEight=!tableOpen&&p2Group!==null&&gs?countBallsLeft(gs,p2Group)===0:false
  const curOnEight=turn===1?p1OnEight:p2OnEight
  const curColor=turn===1?c1:c2
  const aiThinking=gs?.aiThinking??false
  const isAiTurn=isAiMode&&turn===2
  void tick

  const phaseLabel=phase==='aiming'?(isBreak?'🎱 BREAK':'AIMING')
    :phase==='shooting'||phase==='resolving'?'⏳ IN MOTION'
    :phase==='ballInHand'?'✋ BALL IN HAND'
    :phase==='gameOver'?'🏆 GAME OVER':'NEXT PLAYER'

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return
    let rafId=0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evL:{ev:string;fn:any;opts?:AddEventListenerOptions}[]=[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addEv=(ev:string,fn:any,opts?:AddEventListenerOptions)=>{canvas.addEventListener(ev,fn,opts);evL.push({ev,fn,opts})}
    const cleanup=()=>{cancelAnimationFrame(rafId);evL.forEach(({ev,fn,opts})=>canvas.removeEventListener(ev,fn,opts));evL.length=0}

    const initAndRun=()=>{
      cleanup()
      const rect=canvas.getBoundingClientRect()
      if(rect.width<50||rect.height<100){rafId=requestAnimationFrame(initAndRun);return}
      const dpr=window.devicePixelRatio||1
      canvas.width=rect.width*dpr;canvas.height=rect.height*dpr
      const ctx=canvas.getContext('2d')!;ctx.scale(dpr,dpr)
      const W=rect.width,H=rect.height
      stateRef.current=buildState(W,H);triggerUi()
      const powerZoneX=W*0.80

      // ── Touch ──────────────────────────────────────────────────────────────
      const onTouchStart=(e:TouchEvent)=>{
        e.preventDefault();const s=stateRef.current;if(!s)return
        const t=e.changedTouches[0],tx=t.clientX-rect.left,ty=t.clientY-rect.top
        if(s.phase==='ballInHand'&&!isAiTurn){s.ballInHandDragging=true;moveCueBallInHand(s,tx,ty);return}
        if(s.phase!=='aiming'||isAiTurn)return
        if(tx>powerZoneX){s.powerDragging=true;s.powerTouchStartY=ty;s.powerAtDragStart=s.aimPower}
        else{s.aimDragging=true;const cue=s.balls.find(b=>b.id===0);if(cue)s.aimAngle=Math.atan2(ty-cue.y,tx-cue.x)}
      }
      const onTouchMove=(e:TouchEvent)=>{
        e.preventDefault();const s=stateRef.current;if(!s)return
        const t=e.changedTouches[0],tx=t.clientX-rect.left,ty=t.clientY-rect.top
        if(s.phase==='ballInHand'&&s.ballInHandDragging&&!isAiTurn){moveCueBallInHand(s,tx,ty);return}
        if(s.phase!=='aiming'||isAiTurn)return
        if(s.powerDragging){const dy=(s.powerTouchStartY-ty)/(H*0.5);s.aimPower=Math.max(0,Math.min(1,s.powerAtDragStart+dy))}
        else if(s.aimDragging){const cue=s.balls.find(b=>b.id===0);if(cue)s.aimAngle=Math.atan2(ty-cue.y,tx-cue.x)}
      }
      const onTouchEnd=(e:TouchEvent)=>{e.preventDefault();const s=stateRef.current;if(!s)return;s.aimDragging=false;s.powerDragging=false;s.ballInHandDragging=false}
      addEv('touchstart',onTouchStart,{passive:false});addEv('touchmove',onTouchMove,{passive:false});addEv('touchend',onTouchEnd,{passive:false})

      // ── Mouse ──────────────────────────────────────────────────────────────
      let md=false
      const onMouseDown=(e:MouseEvent)=>{
        const s=stateRef.current;if(!s)return;md=true
        const mx=e.clientX-rect.left,my=e.clientY-rect.top
        if(s.phase==='ballInHand'&&!isAiTurn){s.ballInHandDragging=true;moveCueBallInHand(s,mx,my);return}
        if(s.phase!=='aiming'||isAiTurn)return
        if(mx>powerZoneX){s.powerDragging=true;s.powerTouchStartY=my;s.powerAtDragStart=s.aimPower}
        else{s.aimDragging=true;const cue=s.balls.find(b=>b.id===0);if(cue)s.aimAngle=Math.atan2(my-cue.y,mx-cue.x)}
      }
      const onMouseMove=(e:MouseEvent)=>{
        if(!md)return;const s=stateRef.current;if(!s)return
        const mx=e.clientX-rect.left,my=e.clientY-rect.top
        if(s.phase==='ballInHand'&&s.ballInHandDragging&&!isAiTurn){moveCueBallInHand(s,mx,my);return}
        if(s.phase!=='aiming'||isAiTurn)return
        if(s.powerDragging){const dy=(s.powerTouchStartY-my)/(H*0.5);s.aimPower=Math.max(0,Math.min(1,s.powerAtDragStart+dy))}
        else if(s.aimDragging){const cue=s.balls.find(b=>b.id===0);if(cue)s.aimAngle=Math.atan2(my-cue.y,mx-cue.x)}
      }
      const onMouseUp=()=>{md=false;const s=stateRef.current;if(!s)return;s.aimDragging=false;s.powerDragging=false;s.ballInHandDragging=false}
      addEv('mousedown',onMouseDown);addEv('mousemove',onMouseMove);addEv('mouseup',onMouseUp)

      // ── Main loop ──────────────────────────────────────────────────────────
      const loop=()=>{
        const s=stateRef.current;if(!s)return

        if(s.phase==='gameOver'){
          ctx.clearRect(0,0,W,H);drawTable(ctx,s);for(const b of s.balls)drawBall(ctx,b)
          rafId=requestAnimationFrame(loop);return
        }

        // AI turn handling
        if(mode==='ai'&&s.turn===2&&s.phase==='aiming'){
          if(!s.aiThinking){
            s.aiThinking=true
            s.aiThinkTimer=Math.round(
              difficulty==='easy'?40+Math.random()*40:
              difficulty==='medium'?50+Math.random()*60:
              60+Math.random()*70)
            s.aiShot=computeAiShot(s,difficulty)
            s.aiStartAngle=s.aimAngle;s.aiAnimTimer=0
            triggerUi()
          } else if(s.aiThinkTimer>0){
            s.aiThinkTimer--;if(s.aiThinkTimer===0)triggerUi()
          } else if(s.aiAnimTimer<28){
            s.aiAnimTimer++
            const t=s.aiAnimTimer/28,ease=t<0.5?2*t*t:-1+(4-2*t)*t
            const target=s.aiShot?.aimAngle??s.aimAngle
            let diff2=target-s.aiStartAngle
            while(diff2>Math.PI)diff2-=2*Math.PI;while(diff2<-Math.PI)diff2+=2*Math.PI
            s.aimAngle=s.aiStartAngle+diff2*ease
            s.aimPower=s.aiShot?.power??0.5
          } else {
            // Fire AI shot
            const cue=s.balls.find(b=>b.id===0)
            if(cue){
              const shot=s.aiShot??{aimAngle:s.aimAngle,power:0.45}
              s.aimAngle=shot.aimAngle;s.aimPower=shot.power
              const spd=Math.max(0.08,shot.power)*MAX_SHOT_SPEED
              cue.vx=Math.cos(shot.aimAngle)*spd;cue.vy=Math.sin(shot.aimAngle)*spd
              s.phase='shooting';s.pottedThisTurn=[];s.cuePottedThisTurn=false
              s.firstBallHitId=null;s.railContactAfterHit=false;s.cushionsHitOnBreak=[];s.foulReason=null
              const sg=s.p2Group
              s.wasOnEightAtShotStart=!s.tableOpen&&sg!==null&&countBallsLeft(s,sg)===0
              s.aiThinking=false;s.aiThinkTimer=0;s.aiAnimTimer=0;s.aiShot=null
            }
            triggerUi()
          }
        }

        // AI ball-in-hand
        if(mode==='ai'&&s.turn===2&&s.phase==='ballInHand'){
          if(!s.aiThinking){
            s.aiThinking=true
            s.aiThinkTimer=Math.round(35+Math.random()*35)
            s.aiPlacement=computeAiBallInHandPlacement(s,difficulty)
            triggerUi()
          } else if(s.aiThinkTimer>0){
            s.aiThinkTimer--
          } else {
            if(s.aiPlacement)moveCueBallInHand(s,s.aiPlacement.x,s.aiPlacement.y)
            s.phase='aiming';s.ballInHandDragging=false;s.pendingBallInHand=false
            s.ballInHandRestricted=false;s.foulReason=null
            s.aiThinking=false;s.aiThinkTimer=0;s.aiPlacement=null
            triggerUi()
          }
        }

        if(s.phase==='shooting'||s.phase==='resolving'){
          updatePhysics(s)
          for(const b of s.balls){const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy);b.spin+=(spd/b.r)*0.4}
          if(s.phase==='shooting')s.phase='resolving'
          if(allStopped(s)){
            s.aiThinking=false;s.aiThinkTimer=0;s.aiAnimTimer=0;s.aiShot=null
            resolveTurn(s,triggerUi,onGameEndRef.current)
          }
        } else if(s.phase==='turnChange'){
          s.turnChangeTimer--
          if(s.turnChangeTimer<=0){
            if(s.pendingBallInHand){
              if(!s.balls.find(b=>b.id===0)){
                const y=s.ballInHandRestricted?(s.playY1+s.headStringY)/2:s.centreSpotY
                s.balls.push({id:0,x:s.spotX,y,vx:0,vy:0,r:s.ballR,spin:0})
              }
              s.phase='ballInHand'
            }else{s.phase='aiming'}
            triggerUi()
          }
        } else if(s.phase==='aiming'||s.phase==='ballInHand'){
          for(const b of s.balls)b.spin*=0.94
        }

        // ── Draw ──────────────────────────────────────────────────────────────
        ctx.clearRect(0,0,W,H);drawTable(ctx,s)
        if(s.phase==='ballInHand'&&s.ballInHandRestricted)drawKitchen(ctx,s)
        if(s.phase==='aiming'){const cue=s.balls.find(b=>b.id===0);if(cue)drawAimSystem(ctx,s,cue)}
        for(const b of s.balls){
          if(s.phase==='ballInHand'&&b.id===0&&!(mode==='ai'&&s.turn===2)){
            const valid=isValidCuePlacement(s,b.x,b.y)
            ctx.beginPath();ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2)
            ctx.strokeStyle=valid?'rgba(50,255,50,0.55)':'rgba(255,50,50,0.75)';ctx.lineWidth=2.5;ctx.stroke()
          }
          drawBall(ctx,b)
        }
        if(s.phase==='aiming')drawPowerBar(ctx,s,W,H,powerZoneX)
        drawOverlay(ctx,s,W,H,c1,c2)
        rafId=requestAnimationFrame(loop)
      }
      rafId=requestAnimationFrame(loop)
    }

    let rt=0
    const ro=new ResizeObserver(()=>{clearTimeout(rt);rt=window.setTimeout(initAndRun,150)})
    ro.observe(canvas);initAndRun()
    return()=>{cleanup();ro.disconnect();clearTimeout(rt)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[p1Color,mode,difficulty,triggerUi])

  return(
    <div className="h-full flex flex-col" style={{background:'#2a1a0a'}}>
      {/* Header */}
      <div className="flex-shrink-0"
        style={{paddingTop:'env(safe-area-inset-top)',background:'rgba(26,14,4,0.97)',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onBack} className="p-2 rounded-xl" style={{background:'rgba(255,255,255,0.08)'}}>
            <ChevronLeft size={20} className="text-white"/>
          </button>
          <span className="text-base font-bold text-white">Pool</span>
          <span className="text-xs px-2 py-0.5 rounded-full"
            style={{background:'rgba(255,255,255,0.07)',color:'rgba(255,255,255,0.45)'}}>
            {phaseLabel}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs font-bold" style={{color:c1}}>{isAiMode?'You':' P1'} {p1OnEight?'🎱':''}</div>
              <div className="text-xs" style={{color:'rgba(255,255,255,0.38)'}}>{tableOpen?'OPEN':`${p1Group==='solids'?'●':'◑'} ${p1Left}`}</div>
            </div>
            <div className="text-xs font-black" style={{color:'rgba(255,255,255,0.22)'}}>vs</div>
            <div className="text-left">
              <div className="text-xs font-bold" style={{color:c2}}>{isAiMode?'AI':'P2'} {p2OnEight?'🎱':''}</div>
              <div className="text-xs" style={{color:'rgba(255,255,255,0.38)'}}>{tableOpen?'OPEN':`${p2Group==='solids'?'●':'◑'} ${p2Left}`}</div>
            </div>
          </div>
        </div>

        <div className="px-3 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold px-3 py-1 rounded-full"
            style={{background:`${curColor}22`,color:curColor}}>
            {isAiMode?(turn===1?'Your Turn':'AI is playing...'):`P${turn}'s Turn`}
            {!tableOpen&&(turn===1?p1Group:p2Group)?` · ${(turn===1?p1Group:p2Group)!.toUpperCase()}`:tableOpen?' · OPEN TABLE':''}
          </span>
          {curOnEight&&phase==='aiming'&&!foulReason&&(
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{background:'rgba(245,197,24,0.18)',color:'#f5c518'}}>
              🎱 ON THE 8-BALL
            </span>
          )}
        </div>

        {foulReason&&(
          <div className="px-3 pb-2">
            <span className="text-xs font-bold" style={{color:'#ef4444'}}>⚠ FOUL: {FOUL_TEXT[foulReason]}</span>
          </div>
        )}
        {phase==='ballInHand'&&!foulReason&&!isAiTurn&&(
          <div className="px-3 pb-2">
            <span className="text-xs" style={{color:'#f5c518'}}>✋ Drag the cue ball{bihRestricted?' (kitchen only)':' anywhere'}, then tap PLACE</span>
          </div>
        )}
        {isAiMode&&turn===2&&phase==='aiming'&&aiThinking&&(
          <div className="px-3 pb-2">
            <span className="text-xs" style={{color:'#a855f7'}}>🤖 AI is lining up...</span>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="canvas-area" style={{position:'relative'}}>
        <canvas ref={canvasRef}
          style={{position:'absolute',inset:0,width:'100%',height:'100%',touchAction:'none',display:'block'}}/>

        {phase==='aiming'&&!isAiTurn&&(
          <button onClick={handleShoot} style={{
            position:'absolute',bottom:20,left:'38%',transform:'translateX(-50%)',
            background:'#f5c518',color:'#111',fontWeight:800,fontSize:15,
            padding:'12px 28px',borderRadius:28,border:'none',
            boxShadow:'0 4px 20px rgba(0,0,0,0.65)',zIndex:20,letterSpacing:'0.04em',
          }}>🎱 SHOOT</button>
        )}

        {phase==='ballInHand'&&!isAiTurn&&(
          <button onClick={handlePlaceBall} style={{
            position:'absolute',bottom:20,left:'38%',transform:'translateX(-50%)',
            background:'#22c55e',color:'#fff',fontWeight:800,fontSize:15,
            padding:'12px 28px',borderRadius:28,border:'none',
            boxShadow:'0 4px 20px rgba(0,0,0,0.65)',zIndex:20,letterSpacing:'0.04em',
          }}>✓ PLACE BALL</button>
        )}

        {phase==='gameOver'&&(
          <div style={{position:'absolute',inset:0,zIndex:30,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.88)'}}>
            <div style={{fontSize:20,marginBottom:8}}>🎱</div>
            <div style={{fontSize:32,fontWeight:800,marginBottom:10,color:gameWinner===1?c1:c2,textShadow:`0 0 24px ${gameWinner===1?c1:c2}`}}>
              {isAiMode?(gameWinner===1?'You Win!':'AI Wins!'):(gameWinner===1?'P1 Wins!':'P2 Wins!')}
            </div>
            <div style={{fontSize:14,color:'rgba(255,255,255,0.65)',marginBottom:36,textAlign:'center',padding:'0 28px',lineHeight:1.5}}>
              {gameOverMsg}
            </div>
            <button onClick={handlePlayAgain} style={{background:'#f5c518',color:'#111',fontWeight:800,fontSize:16,padding:'14px 44px',borderRadius:32,border:'none',boxShadow:'0 4px 20px rgba(0,0,0,0.5)',marginBottom:14,cursor:'pointer'}}>
              Play Again
            </button>
            <button onClick={onBack} style={{background:'rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.7)',fontWeight:600,fontSize:14,padding:'12px 36px',borderRadius:32,border:'1px solid rgba(255,255,255,0.15)',cursor:'pointer'}}>
              Back to Games
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
