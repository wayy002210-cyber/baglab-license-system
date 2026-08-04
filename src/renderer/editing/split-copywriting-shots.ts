export type ShotCategory = { id: string; name: string };
export type RecommendedShot = {
  copywriting: string;
  role: "hook" | "problem" | "proof" | "solution" | "cta" | "custom";
  categoryId: string;
  recommendationReason: string;
  source: "keyword" | "default";
};

const RULES: Array<{ words:string[]; categoryWords:string[]; role:RecommendedShot["role"] }> = [
  { words:["车间","生产","工序","设备","加工","制造","质检","品质","质量"], categoryWords:["生产","操作","过程","工厂"], role:"proof" },
  { words:["到店","门店","地址","欢迎","门头"], categoryWords:["门头","店内","环境"], role:"cta" },
  { words:["产品","成品","材质","细节","包装"], categoryWords:["产品","成品"], role:"solution" },
  { words:["客户","员工","师傅","我们"], categoryWords:["人物","员工","服务"], role:"custom" },
  { words:["为什么","你知道","注意","别再"], categoryWords:["人物","产品"], role:"hook" },
  { words:["痛点","浪费","问题","担心","踩坑"], categoryWords:["产品","人物"], role:"problem" }
];

function sentences(text:string):string[]{
  const parts=text.replace(/\r\n?/g,"\n").match(/[^。！？!?；;\n]+[。！？!?；;]?/g)?.map(v=>v.trim()).filter(Boolean)??[];
  const result:string[]=[];
  for(const part of parts){
    if(part.replace(/[。！？!?；;\s]/g,"").length<5){
      if(result.length) result[result.length-1]+=part;
      else result.push(part);
    } else if(result.length===1&&result[0].replace(/[。！？!?；;\s]/g,"").length<5){
      result[0]+=part;
    } else result.push(part);
  }
  return result;
}

export function splitAndRecommendShots(text:string,categories:ShotCategory[]):RecommendedShot[]{
  if(!categories.length) throw new Error("素材中心尚未创建素材分类");
  return sentences(text).map((copywriting)=>{
    const rule=RULES.find(item=>item.words.some(word=>copywriting.includes(word)));
    if(rule){
      const category=categories.find(item=>rule.categoryWords.some(word=>item.name.includes(word)));
      if(category)return{copywriting,role:rule.role,categoryId:category.id,recommendationReason:`根据台词关键词建议使用“${category.name}”素材`,source:"keyword"};
    }
    return{copywriting,role:"custom",categoryId:categories[0].id,recommendationReason:`未识别到明确场景，暂用“${categories[0].name}”，请人工确认`,source:"default"};
  });
}
