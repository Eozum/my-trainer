import {addDays,day,type State,type Session} from "./model";
export function generate(state:State,today=day()) {
 const {race,activities}=state;
 const days=Math.round((Date.parse(race.date)-Date.parse(today))/86400000);
 if(days<1||days>365) throw new Error("Choisissez une course dans les 365 prochains jours.");
 const recent=activities.filter(a=>a.date>=addDays(today,-28)&&a.date<=today);
 const weekKm=recent.reduce((s,a)=>s+a.distance,0)/4;
 const base=recent.length>=4?Math.max(5,Math.min(race.weeklyKm,weekKm)):race.weeklyKm;
 const old=state.sessions.map(s=>s.date<today&&s.status==="planned"?{...s,status:"missed" as const}:s);
 const missed=old.filter(s=>s.status==="missed"&&s.date>=addDays(today,-14)&&s.date<today).length;
 const completed=old.filter(s=>s.status==="done"&&s.date>=addDays(today,-14)&&s.date<today).length;
 const factor=missed?Math.max(.6,1-missed*.12):1;
 const pace=recent.length?Math.max(4,Math.min(12,recent.reduce((s,a)=>s+a.minutes,0)/recent.reduce((s,a)=>s+a.distance,0))):7;
 const reasons=[recent.length>=4?`Volume fondé sur 28 jours : ${weekKm.toFixed(1)} km/semaine.`:"Historique insuffisant : volume déclaré utilisé, allures à l’effort.",missed?`${missed} séance(s) manquée(s) : volume réduit de ${Math.round((1-factor)*100)} %, sans rattrapage.`:"Progression limitée à 5 % par semaine, semaine allégée toutes les 4 semaines."];
 if(days<28) reasons.push("Préparation courte : priorité à la continuité, sans chercher à combler le retard.");
 if(race.distance>42) reasons.push("Distance ultra : cette base générique demande une validation par un entraîneur.");
 if(race.goal==="time") reasons.push(`Objectif ${race.targetMinutes} min enregistré ; il ne force pas une allure sans référence de performance.`);
 const slots=({2:[2,6],3:[1,3,6],4:[1,3,5,6],5:[0,1,3,5,6]} as Record<number,number[]>)[race.days];
 const sessions:Session[]=old.filter(s=>s.date<today);
 for(let i=0;i<=days;i++){
 const date=addDays(today,i), existing=old.find(s=>s.date===date&&s.status!=="planned");
 if(existing){sessions.push(existing);continue;}
 if(date===race.date){sessions.push({id:date,date,kind:"Course cible",km:race.distance,minutes:race.targetMinutes,elevation:race.elevation,note:"Départ prudent, gestion à l’effort.",status:"planned"});continue;}
 const weekday=(new Date(date+"T12:00:00Z").getUTCDay()+6)%7;
 if(!slots.includes(weekday))continue;
 const anchor=state.planStart??today;
 const week=Math.max(0,Math.floor((Date.parse(date)-Date.parse(anchor))/604800000)), remaining=days-i;
 const taper=remaining<=7?.5:remaining<=14?.75:1;
 const goalFactor=race.goal==="finish"?.9:1;
 const volume=base*factor*goalFactor*Math.pow(1.05,Math.min(week,8))*(week%4===3?.8:1)*taper;
 const long=weekday===6, quality=weekday===3&&race.days>=3&&remaining>10&&missed===0&&base>=15&&days>=28;
 const share=long?.38:(.62/(race.days-1));
 const km=Math.round(Math.max(2,volume*share)*10)/10;
 const kind=long?"Sortie longue":quality?(race.terrain==="route"?"Tempo contrôlé":"Côtes en souplesse"):"Endurance facile";
 sessions.push({id:date,date,kind,km,minutes:Math.round(km*pace*(quality?.95:1.08)),elevation:race.terrain==="route"?0:Math.round(km*race.elevation/race.distance*.6),note:quality?"15 min faciles, puis 4 × 3 min à effort soutenu, récupération 2 min. Finir facile.":long?"Aisance respiratoire. Marcher dans les pentes si besoin.":"Effort conversationnel, sans chercher une allure précise.",status:"planned"});
 }
 return {sessions,reasons,base:Math.round(base*factor*10)/10,completed,missed};
}
