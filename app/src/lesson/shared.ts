// Styles the lesson screen shares with its parts (question, result panel,
// tutor) and with the renderer check page: the frame, the column under the
// Check bar, and the answer input.
import { StyleSheet } from "react-native";
import { color, COLUMN, font, GUTTER, radius, space } from "../theme";

export const lessonShared = StyleSheet.create({
  // One reading column: header, body and the Check bar's contents share it.
  head: { paddingHorizontal: GUTTER, paddingTop: space(1), paddingBottom: space(1), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  headRow: { flexDirection: "row", alignItems: "center", minHeight: 44 },
  body: { paddingHorizontal: GUTTER, paddingTop: space(2), maxWidth: COLUMN, width: "100%", alignSelf: "center" },
  foot: { paddingHorizontal: GUTTER, paddingVertical: space(1.5), backgroundColor: color.paper },
  // Contents of the Check bar and the result panel line up with the lesson column.
  footInner: { maxWidth: COLUMN - 2 * GUTTER, width: "100%", alignSelf: "center" },
  input: {
    borderRadius: radius.input,
    paddingHorizontal: space(2),
    paddingVertical: space(1.5),
    fontSize: 19,
    fontFamily: font.semibold,
    color: color.ink,
    backgroundColor: color.paperDeep,
    minHeight: 54,
    marginTop: space(0.5),
    outlineColor: color.azure,
  } as object,
});
