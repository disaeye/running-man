/** 活动基础字段类术语（距离/配速/睡眠/体重等） */
export const TERMS_ACTIVITY = {
  CADENCE: {
    label: "步频 (Cadence)",
    explanation: {
      summary: "跑步每分钟步数或骑行每分钟踏频。",
      reference: "跑步 spm · 骑行 rpm",
      note: "动作经济性和节奏稳定性的重要指标。"
    },
  },
  ELEVATION_GAIN: {
    label: "爬升 (Elevation Gain)",
    explanation: {
      summary: "活动累计上升高度。",
      reference: "单位 m",
      note: "反映路线起伏带来的额外负荷。"
    },
  },
  DISTANCE: {
    label: "距离 (Distance)",
    explanation: {
      summary: "活动完成的路线长度。",
      reference: "单位 km",
      note: "配速、训练量和比赛预测的基础。"
    },
  },
  DURATION: {
    label: "时长 (Duration)",
    explanation: {
      summary: "从开始到结束的训练时间。",
      reference: "单位 h:m:s",
      note: "耐力刺激和恢复需求的重要输入。"
    },
  },
  PACE: {
    label: "配速 (Pace)",
    explanation: {
      summary: "每完成 1 公里所需时间。",
      reference: "单位 min/km",
      note: "跑步训练中最直观的指标。"
    },
  },
  SLEEP_DURATION: {
    label: "睡眠时长 (Sleep Duration)",
    explanation: {
      summary: "夜间总睡眠时间。",
      reference: "单位 h:m",
      note: "恢复评分和训练建议的重要背景。"
    },
  },
  BODY_WEIGHT: {
    label: "体重 (Body Weight)",
    explanation: {
      summary: "身体质量。",
      reference: "单位 kg",
      note: "功率体重比、恢复趋势和长期健康观察。"
    },
  },
  GAP: {
    label: "GAP (Grade Adjusted Pace)",
    explanation: {
      summary: "坡度修正配速 —— 将上坡/下坡配速换算为平地等效配速。",
      reference: "单位 min/km",
      note: "跑步负荷的科学修正指标。"
    },
  },
  NGP: {
    label: "NGP (Normalized Graded Pace)",
    explanation: {
      summary: "4 次方平滑的 GAP，捕捉变速跑的代谢应变。",
      reference: "单位 min/km",
      note: "跑步功率的直接模拟。"
    },
  },
} as const;
