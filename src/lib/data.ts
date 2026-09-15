export type Player = {
  id: number; name: string; gameName: string; position: string; rank: string;
  wins: number; losses: number; winRate: number; kda: number; mvp: number;
  bio: string; avatar: string;
};

export type Match = {
  id: number; name: string; date: string; status: "CREATED" | "LIVE" | "FINISHED";
  bo: string; playerCount: number; teamCount: number; signed?: boolean;
  teams: [string, string]; score: [number, number]; round: string;
};

export const players: Player[] = [
  [1,"小丫丫","XiaoYaya","上路","最强王者",18,5,78,4.8,6,"稳健的边路压制者","/assets/avatars/1.png"],
  [2,"漩涡亮","XuanWoLiang","打野","傲世宗师",16,7,70,4.1,4,"用节奏定义比赛","/assets/avatars/1.png"],
  [3,"蓝色","LanSe","中路","最强王者",15,8,65,3.9,3,"峡谷里的冷静指挥","/assets/avatars/1.png"],
  [4,"mosgl","mosgl","下路","傲世宗师",14,8,64,4.4,2,"输出是最好的语言","/assets/avatars/1.png"],
  [5,"嘉文","JiaWen","辅助","超凡大师",12,10,55,3.6,1,"把胜利留给队友","/assets/avatars/1.png"],
  [6,"悠走","YouZou","上路","超凡大师",11,9,55,3.2,1,"永不缺席的团战","/assets/avatars/1.png"],
  [7,"小智","XiaoZhi","打野","钻石 I",9,12,43,2.7,0,"正在寻找下一次机会","/assets/avatars/1.png"],
  [8,"Sheriff","Sheriff","中路","钻石 I",8,13,38,2.5,0,"专注每一个细节","/assets/avatars/1.png"],
  [9,"鸟","Niao","下路","翡翠 I",7,14,33,2.2,0,"火力全开","/assets/avatars/1.png"],
  [10,"神奈","ShenNai","辅助","翡翠 II",6,15,29,2.0,0,"为团队创造空间","/assets/avatars/1.png"],
].map(([id,name,gameName,position,rank,wins,losses,winRate,kda,mvp,bio,avatar]) => ({ id, name, gameName, position, rank, wins, losses, winRate, kda, mvp, bio, avatar } as Player));

export const matches: Match[] = [
  { id: 1, name: "LSPL 秋季赛 · 揭幕战", date: "2026/9/16", status: "LIVE", bo: "BO3", playerCount: 10, teamCount: 2, signed: true, teams: ["T1", "GEN"], score: [1, 1], round: "第 3 局进行中" },
  { id: 2, name: "峡谷冠军挑战赛", date: "2026/9/16", status: "CREATED", bo: "BO1", playerCount: 8, teamCount: 2, teams: ["DRX", "TES"], score: [0, 0], round: "等待报名" },
  { id: 3, name: "LSPL 夏日淘汰赛", date: "2026/9/12", status: "FINISHED", bo: "BO3", playerCount: 10, teamCount: 2, teams: ["GEN", "TES"], score: [2, 1], round: "比赛已结束" },
  { id: 4, name: "周末峡谷杯", date: "2026/9/08", status: "FINISHED", bo: "BO1", playerCount: 10, teamCount: 2, teams: ["蓝队", "紫队"], score: [1, 0], round: "比赛已结束" },
];

export function getMatch(id: number) { return matches.find((match) => match.id === id) ?? matches[0]; }

export function leaderboard() { return [...players].sort((a, b) => b.winRate - a.winRate || b.kda - a.kda); }
