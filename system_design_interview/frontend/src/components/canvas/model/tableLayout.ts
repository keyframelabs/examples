import type { CanvasField } from "@/components/canvas/model/types";

export const TABLE_HEADER_HEIGHT = 38;
export const TABLE_FIELD_TOP = 48;
export const TABLE_FIELD_HEIGHT = 25;
const TABLE_FIELD_BOTTOM_PADDING = 36;

export function tableHeightForFields(fields: CanvasField[]): number {
  return (
    TABLE_FIELD_TOP +
    fields.length * TABLE_FIELD_HEIGHT +
    TABLE_FIELD_BOTTOM_PADDING
  );
}
