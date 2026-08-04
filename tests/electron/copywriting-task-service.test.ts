import Database from "better-sqlite3";
import { afterEach,beforeEach,describe,expect,it } from "vitest";
import { applyMigrations } from "../../electron/database";
import { CopywritingProjectRepository } from "../../electron/repositories/copywriting-project-repository";
import { TaskRepository } from "../../electron/repositories/task-repository";
import { createProjectTasks } from "../../electron/services/copywriting-task-service";

describe("createProjectTasks",()=>{
 let db:Database.Database,projects:CopywritingProjectRepository,tasks:TaskRepository;
 beforeEach(()=>{db=new Database(":memory:");applyMigrations(db);projects=new CopywritingProjectRepository(db);tasks=new TaskRepository(db)});afterEach(()=>db.close());
 it("creates pending immutable snapshots and archives projects in one operation",()=>{
  const now=new Date().toISOString();
  db.prepare("INSERT INTO personas(id,name,industry,brand_facts_json,tone,cta,banned_words_json,is_default,created_at,updated_at) VALUES ('persona','工厂','工厂','[]','','','[]',1,?,?)").run(now,now);
  db.prepare("INSERT INTO asset_categories(id,name,folder_path,created_at) VALUES ('c1','生产过程','D:/生产',?)").run(now);
  const project=projects.create({personaId:"persona",topicId:"topic",topicTitle:"选题",mainTitle:"品质真相",text:"车间严格生产。",model:"deepseek-v3",status:"library"});
  projects.replaceShots(project.id,[{copywriting:"车间严格生产。",suggestedCategoryId:"c1",assetCategoryId:"c1",suggestionSource:"keyword",suggestionConfirmed:true,durationMode:"voice",durationSec:null,muteOriginal:true}]);
  const created=createProjectTasks({database:db,projectRepository:projects,taskRepository:tasks,projectIds:[project.id],seed:10,personas:[{id:"persona",name:"工厂"}],assets:[{id:"a1",categoryId:"c1",status:"ready",durationSec:5,filePath:"D:/a.mp4"}],voice:{voiceId:"v1",source:"system",model:"speech-2.8-hd",emotion:"calm",speed:1,volume:1,pitch:0,languageBoost:"Chinese"},media:{},bgm:null,stylePresets:[],subtitleStyle:null,titleStyle:null});
  expect(created).toHaveLength(1);expect(created[0].status).toBe("pending");expect(created[0].snapshot).toMatchObject({approved:true,copywriting:{mainTitle:"品质真相"},voice:{voiceId:"v1"},shots:[{assetCategoryId:"c1"}]});expect(projects.get(project.id)?.status).toBe("archived");
 });
});
