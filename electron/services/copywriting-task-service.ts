import type Database from "better-sqlite3";
import type { CopywritingProjectRepository } from "../repositories/copywriting-project-repository.js";
import type { GenerationTask,TaskRepository } from "../repositories/task-repository.js";

type Input={database:Database.Database;projectRepository:CopywritingProjectRepository;taskRepository:TaskRepository;projectIds:string[];seed:number;personas:Array<Record<string,unknown>&{id:string}>;assets:Array<Record<string,unknown>&{id:string;categoryId:string;status:string;durationSec:number|null;filePath:string}>;voice:Record<string,unknown>&{voiceId:string};media:Record<string,unknown>;bgm:Record<string,unknown>|null;stylePresets:Array<{id:string;name:string;subtitleStyle:unknown;titleStyle:unknown}>;subtitleStyle:unknown;titleStyle:unknown;bgmPath?:string|null;bgmCandidates?:string[]};

export function createProjectTasks(input:Input):GenerationTask[]{
 if(!input.projectIds.length)throw new Error("没有可创建任务的文案");
 const create=input.database.transaction(()=>input.projectIds.map((projectId,index)=>{
  const project=input.projectRepository.require(projectId);if(project.status!=="shots_ready")throw new Error(`《${project.mainTitle||project.topicTitle}》尚未完成镜头拆分`);
  const shots=input.projectRepository.listShots(projectId);if(!shots.length||shots.some(s=>!s.assetCategoryId||!s.copywriting.trim()))throw new Error(`《${project.mainTitle||project.topicTitle}》存在未完成的镜头`);
  const persona=input.personas.find(item=>item.id===project.personaId);if(!persona)throw new Error("文案关联的人设档案不存在");
  const categories=new Set(shots.map(s=>s.assetCategoryId));const assets=input.assets.filter(a=>a.status==="ready"&&Boolean(a.durationSec)&&categories.has(a.categoryId));
  for(const category of categories)if(!assets.some(a=>a.categoryId===category))throw new Error(`《${project.mainTitle||project.topicTitle}》有镜头对应的素材分类为空`);
  const seed=input.seed+index;const preset=input.stylePresets.length?input.stylePresets[Math.abs(seed)%input.stylePresets.length]:null;
  const candidates=input.bgmCandidates??[];const bgmPath=candidates.length?candidates[Math.abs(seed)%candidates.length]:input.bgmPath??(input.bgm?.sourceType==="file"?String(input.bgm.path):null);
  const snapshot={approved:true,persona:structuredClone(persona),copywriting:{model:project.model,text:project.text,mainTitle:project.mainTitle},voice:structuredClone(input.voice),audioSegments:[],shots:shots.map(s=>({index:s.index,role:"custom",assetCategoryId:s.assetCategoryId,copywriting:s.copywriting,durationMode:s.durationMode,durationSec:s.durationSec,muteOriginal:s.muteOriginal})),template:{name:project.mainTitle||project.topicTitle,shots:[]},assets:structuredClone(assets),bgm:structuredClone(input.bgm),bgmPath,subtitleStyle:structuredClone(preset?.subtitleStyle??input.subtitleStyle),titleStyle:structuredClone(preset?.titleStyle??input.titleStyle),stylePresetId:preset?.id??"built-in-safe",media:structuredClone(input.media)};
  const [task]=input.taskRepository.createBatch({templateId:`copywriting:${project.id}`,personaId:project.personaId,count:1,seed,snapshot});input.projectRepository.archive(project.id);return task;
 }));return create();
}
