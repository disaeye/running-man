import { METRIC_REGISTRY } from "@shared/config/generated/metric-registry";

/** 生理指标与估算方法类术语 */
export const TERMS_PHYSIOLOGY = {
  VO2MAX: {
    label: "最大摄氧量 (VO₂max)",
    explanation: {
      summary: "每分钟每公斤体重能利用的最大氧气量。",
      reference: "单位 ml/kg/min",
      note: "有氧能力金标准。"
    },
  },
  HR: {
    label: "心率",
    explanation: {
      summary: "每分钟心跳次数。",
      reference: "单位 bpm",
      note: "最直接的生理反馈。"
    },
  },
  LTHR: {
    label: METRIC_REGISTRY.lthr.display_name,
    explanation: {
      summary: "乳酸阈值心率 (LTHR) — 接近 1 小时比赛强度时可持续的心率。",
      reference: "单位 bpm · 通常低于 HRmax 10–20 bpm",
      note: "心率分区核心锚点。"
    },
  },
  THRESHOLD_PACE: {
    label: METRIC_REGISTRY.threshold_pace.display_name,
    explanation: {
      summary: "阈值配速 (Threshold Pace) — 接近乳酸阈值、可持续约 40–60 分钟的配速。",
      reference: "单位 min/km",
      note: "跑步训练最直观的节奏指标。"
    },
  },
  RACE_SIGNAL: {
    label: "比赛能力信号 (Race Signal)",
    explanation: {
      summary: "来自比赛成绩或临界速度模型的跑步表现信号。",
      reference: "有足够 GPS/配速历史时用于成绩预测",
      note: "VDOT / 阈值配速 的综合能力指标。"
    },
  },
  RHR: {
    label: "静息心率 (RHR)",
    explanation: {
      summary: "晨起静息心率。",
      reference: "单位 bpm",
      note: "越低心肺功能越好；突然升高可能过度训练。"
    },
  },
  RECOVERY_SCORE: {
    label: METRIC_REGISTRY.local_readiness.display_name,
    explanation: {
      summary: "睡眠、静息心率、TSB、ATL 变化、HRV 的加权综合，输出 0–100 的当日恢复评分。",
      reference: "0–100 · 越高表示越适合承受训练刺激",
      note: "本地恢复评分，权重：睡眠 25%、静息心率 20%、TSB 25%、ATL 变化 15%、HRV 15%。",
    },
  },
  VO2MAX_METHOD: {
    label: "VO₂max 估算方法 (VO2max Method)",
    explanation: {
      summary: "VDOT 模型或临界速度模型的 VO₂max 估算。",
      reference: "单位 ml/kg/min",
      note: "基于 Daniels 模型或 Hughson 临界功率模型。"
    },
  },
  EFFICENCY_FACTOR: {
    label: "效率系数 (Efficiency Factor)",
    explanation: {
      summary: "功率 / 心率，衡量心肺效率。",
      reference: "比率",
      note: "功率运动的核心指标。"
    },
  },
  AEROBIC_DECOUPLING: {
    label: "有氧漂移 (Aerobic Decoupling)",
    explanation: {
      summary: "功率与心率之间的解耦 %。",
      reference: "单位 %",
      note: "反映心肺适应性和训练质量。"
    },
  },
  VDOT: {
    label: "VDOT跑力 (VDOT)",
    explanation: {
      summary: "Jack Daniels 单数跑力指标，映射比赛成绩到 VO₂max。",
      reference: "单位 ml/kg/min",
      note: "Daniels 模型，行业标准。"
    },
  },
  LTHR_METHOD: {
    label: "LTHR 估算方法 (LTHR Method)",
    explanation: {
      summary: "20 分钟最佳努力 HR × 0.98 或 60 分钟最佳努力 HR。",
      reference: "单位 bpm",
      note: "Intervals.icu 标准方法。"
    },
  },
  HRMAX_METHOD: {
    label: "HRmax 估算方法 (HRmax Method)",
    explanation: {
      summary: "切线法 KDE (Tangent Method) 或滚动最大值。",
      reference: "单位 bpm",
      note: "基于 KU Leuven 验证的科学方法。"
    },
  },
  FTP_METHOD: {
    label: "FTP 检测方法 (FTP Method)",
    explanation: {
      summary: "20 分钟峰值功率 × 0.95、8 分钟 × 0.90、5 分钟 × 0.85。",
      reference: "单位 W",
      note: "行业标准 FTP 检测。"
    },
  },
  RACE_PREDICTION: {
    label: "比赛预测 (Race Prediction)",
    explanation: {
      summary: "Riegel 公式 + 临界速度模型双验证。",
      reference: "单位 min/km",
      note: "基于最近比赛努力的科学预测。"
    },
  },
  THRESHOLD_PACE_METHOD: {
    label: "阈值配速估算方法 (Threshold Pace Method)",
    explanation: {
      summary: "临界速度模型 (Critical Speed Model)。",
      reference: "单位 min/km",
      note: "Hughson 模型，科学准确。"
    },
  },
} as const;
