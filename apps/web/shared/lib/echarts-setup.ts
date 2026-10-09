import * as echarts from "echarts/core";
import { LineChart, BarChart, RadarChart, PieChart } from "echarts/charts";
import {
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  RadarComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { v7LightTheme, v7DarkTheme } from "./chart-preset";

echarts.use([
  LineChart, BarChart, RadarChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, DataZoomComponent,
  MarkAreaComponent, MarkLineComponent, MarkPointComponent,
  RadarComponent,
  CanvasRenderer,
]);

echarts.registerTheme("v7-light", v7LightTheme);
echarts.registerTheme("v7-dark", v7DarkTheme);

export { echarts };
