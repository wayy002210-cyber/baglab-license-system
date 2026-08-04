import Database from "better-sqlite3";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { applyMigrations } from "../../electron/database";
import { TaskRepository } from "../../electron/repositories/task-repository";
import { GenerationQueue } from "../../electron/services/generation-queue";

describe("GenerationQueue",()=>{
  let db:Database.Database;let repository:TaskRepository;
  beforeEach(()=>{db=new Database(":memory:");applyMigrations(db);repository=new TaskRepository(db)});
  afterEach(()=>db.close());
  it("runs all pending tasks strictly one at a time and continues after failure",async()=>{
    const tasks=repository.createBatch({templateId:"t",personaId:"p",count:3,seed:1,snapshot:{}});
    let active=0,maxActive=0;
    const runner=vi.fn(async(task:{id:string})=>{active++;maxActive=Math.max(maxActive,active);repository.transition(task.id,"preparing_copy");if(task.id===tasks[1].id)repository.transition(task.id,"failed",{errorMessage:"失败"});else repository.transition(task.id,"completed");active--});
    const queue=new GenerationQueue(repository,runner);
    await queue.startAllPending();
    await queue.whenIdle();
    expect(maxActive).toBe(1);expect(runner).toHaveBeenCalledTimes(3);
    expect(repository.get(tasks[2].id)?.status).toBe("completed");
  });
  it("pauses after the current task and resumes remaining work",async()=>{
    const tasks=repository.createBatch({templateId:"t",personaId:"p",count:2,seed:1,snapshot:{}});
    let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
    const runner=vi.fn(async(task:{id:string})=>{repository.transition(task.id,"preparing_copy");if(task.id===tasks[0].id)await gate;repository.transition(task.id,"completed")});
    const queue=new GenerationQueue(repository,runner);void queue.startAllPending();
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(queue.requestPause().status).toBe("pause_requested");release();await queue.whenIdle();
    expect(queue.getState().status).toBe("paused");expect(repository.get(tasks[1].id)?.status).toBe("pending");
    await queue.resume();await queue.whenIdle();expect(repository.get(tasks[1].id)?.status).toBe("completed");
  });
});
