import { MAX_COLUMNS } from "../../../shared/config.js";
import { layoutBoard, palette } from "../board.js";
import { row } from "../fields.js";
import { group, numberBox, page, updatePart } from "../kit.js";

export const layoutPage = (ctx) => {
  const settings = ctx.config.layout;
  const set = (key) => (value) => updatePart(ctx, "layout", { [key]: value }, { structural: true });
  return page(
    "Layout",
    "Drag widgets between columns and up or down. Click one to change its settings.",
    layoutBoard(ctx),
    palette(ctx),
    group(
      "Grid",
      row("Columns", numberBox(settings.columns, 1, MAX_COLUMNS, set("columns")), { help: "Columns share the screen width equally." }),
      row("Space between widgets", numberBox(settings.gap, 0, 100, set("gap")), { help: "Pixels." }),
      row("Margin to the screen edges", numberBox(settings.edge, 0, 200, set("edge")), { help: "Pixels." }),
    ),
  );
};
