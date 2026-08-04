import type { GenerationTask, QueueState, TaskRepository } from "../repositories/task-repository.js";

export class GenerationQueue {
  private loopPromise:Promise<void>|null=null;
  private onlyTaskId:string|null=null;
  constructor(private readonly repository:TaskRepository,private readonly runner:(task:GenerationTask)=>Promise<void>){}
  getState():QueueState{return this.repository.getQueueState()}
  async startTask(id:string):Promise<QueueState>{
    const task=this.repository.get(id);if(!task)throw new Error("任务不存在");if(task.status!=="pending")throw new Error("只有待合成任务可以开始");
    if(this.loopPromise)throw new Error("已有任务正在合成，请等待完成");this.onlyTaskId=id;this.repository.saveQueueState("running",null);this.kick();return this.getState();
  }
  async startAllPending():Promise<QueueState>{
    const state=this.getState();if(state.status==="running"||state.status==="pause_requested")return state;
    this.onlyTaskId=null;this.repository.saveQueueState("running",null);this.kick();return this.getState();
  }
  requestPause():QueueState{
    const state=this.getState();if(state.status!=="running")return state;
    return this.repository.saveQueueState(state.activeTaskId?"pause_requested":"paused",state.activeTaskId);
  }
  async resume():Promise<QueueState>{
    const state=this.getState();if(state.status!=="paused")return state;
    this.onlyTaskId=null;this.repository.saveQueueState("running",null);this.kick();return this.getState();
  }
  async whenIdle():Promise<void>{await this.loopPromise}
  private kick():void{if(this.loopPromise)return;this.loopPromise=this.runLoop().finally(()=>{this.loopPromise=null})}
  private async runLoop():Promise<void>{
    while(true){
      const state=this.getState();if(state.status==="pause_requested"){this.repository.saveQueueState("paused",null);return}if(state.status!=="running")return;
      const pending=this.repository.listPending();const task=this.onlyTaskId?pending.find(item=>item.id===this.onlyTaskId):pending[0];
      if(!task){this.repository.saveQueueState("idle",null);return}
      this.repository.saveQueueState("running",task.id);
      try{await this.runner(task)}catch(error){const current=this.repository.get(task.id);if(current&&!['completed','failed','canceled'].includes(current.status)){this.repository.transition(task.id,"failed",{errorCode:"TASK_RUNNER_FAILED",errorMessage:error instanceof Error?error.message:"任务执行失败"})}}
      this.repository.saveQueueState(this.getState().status,null);
      if(this.onlyTaskId){this.onlyTaskId=null;this.repository.saveQueueState("idle",null);return}
    }
  }
}
