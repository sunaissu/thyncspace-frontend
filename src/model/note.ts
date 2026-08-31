import {
  createElement,
  type NoteboardElement,
  type NoteboardViewport,
} from "@sunaissu/noteboard";

export type PermissionLevel = "viewer" | "editor";

export enum NoteType {
  Document = "document",
  Whiteboard = "whiteboard",
}

export interface Collaborator {
  userId: string;
  permission: PermissionLevel;
}

export interface BaseNote {
  _id: string;
  title: string;
  owner: string;
  sharedWith: Collaborator[];
  favoritedBy: string[];
  createdAt: string;
  updatedAt: string;
}
export interface DocumentNote extends BaseNote {
  type: NoteType.Document;
  content: string;
}

export interface WhiteboardContent {
  boardId?: string;
  elements: NoteboardElement[];
  savedAt?: string;
  threadId?: string;
  updatedAt?: string;
  version?: number;
  viewport: NoteboardViewport;
}

export interface WhiteboardNote extends BaseNote {
  type: NoteType.Whiteboard;
  content: WhiteboardContent | string;
}

export type Note = DocumentNote | WhiteboardNote;

const NOTEBOARD_ELEMENT_TYPES = new Set<NoteboardElement["type"]>([
  "rectangle",
  "ellipse",
  "diamond",
  "triangle",
  "line",
  "arrow",
  "text",
  "draw",
  "pen",
  "image",
  "frame",
  "star",
  "sticky-note",
  "callout",
]);

const MAX_ABSOLUTE_BOARD_COORDINATE = 1_000_000_000;
const MAX_BOARD_ELEMENTS = 10_000;
const MAX_ELEMENT_POINTS = 100_000;
const MAX_IMAGE_DATA_URL_LENGTH = 8 * 1024 * 1024;
const MAX_ELEMENT_TEXT_LENGTH = 1_000_000;
const MAX_STYLE_VALUE_LENGTH = 4_096;
const MAX_ELEMENT_ID_LENGTH = 256;
const MAX_ELEMENT_SEED = 2_147_483_647;

const COMMON_ELEMENT_KEYS = [
  "id",
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "opacity",
  "roughness",
  "seed",
  "isDeleted",
  "groupId",
  "locked",
  "dropShadow",
  "blendMode",
] as const;

const SHAPE_TEXT_KEYS = [
  "text",
  "fontSize",
  "fontFamily",
  "textAlign",
  "lineHeight",
  "highlightColor",
  "fontWeight",
  "fontStyle",
  "textDecoration",
] as const;

const TYPE_ELEMENT_KEYS: Record<
  NoteboardElement["type"],
  readonly string[]
> = {
  rectangle: [...SHAPE_TEXT_KEYS, "borderRadius"],
  ellipse: SHAPE_TEXT_KEYS,
  diamond: SHAPE_TEXT_KEYS,
  triangle: SHAPE_TEXT_KEYS,
  line: [
    "points",
    "curveType",
    "routing",
    "startArrowhead",
    "endArrowhead",
    "label",
    "labelFontSize",
    "labelFontFamily",
    "startBinding",
    "endBinding",
  ],
  arrow: [
    "points",
    "curveType",
    "routing",
    "startArrowhead",
    "endArrowhead",
    "label",
    "labelFontSize",
    "labelFontFamily",
    "startBinding",
    "endBinding",
  ],
  text: [...SHAPE_TEXT_KEYS, "baseline"],
  draw: ["points"],
  pen: ["points", "highlighter", "tension"],
  image: ["dataUrl"],
  frame: ["name", "frameColor", "showLabel", "childIds"],
  star: [...SHAPE_TEXT_KEYS, "sides", "isStar", "innerRadius"],
  "sticky-note": [...SHAPE_TEXT_KEYS, "noteColor"],
  callout: [...SHAPE_TEXT_KEYS, "tailDirection"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSafeCoordinate = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= MAX_ABSOLUTE_BOARD_COORDINATE;

const isSafeElementId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_ELEMENT_ID_LENGTH;

const isSafePoint = (value: unknown) =>
  isRecord(value) &&
  isSafeCoordinate(value.x) &&
  isSafeCoordinate(value.y) &&
  (value.pressure === undefined ||
    (typeof value.pressure === "number" &&
      Number.isFinite(value.pressure) &&
      value.pressure >= 0 &&
      value.pressure <= 1));

const isSafeBinding = (value: unknown) =>
  value === undefined ||
  value === null ||
  (isRecord(value) &&
    isSafeElementId(value.elementId) &&
    isSafePoint(value.fixedPoint));

const isOptionalSafeNumber = (value: unknown) =>
  value === undefined || isSafeCoordinate(value);

const isOptionalBoundedNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
) =>
  value === undefined ||
  (typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum);

const isOptionalElementSeed = (value: unknown) =>
  value === undefined ||
  (Number.isSafeInteger(value) &&
    (value as number) >= -MAX_ELEMENT_SEED &&
    (value as number) <= MAX_ELEMENT_SEED);

const isOptionalBoolean = (value: unknown) =>
  value === undefined || typeof value === "boolean";

const isOptionalString = (value: unknown, maxLength: number) =>
  value === undefined ||
  (typeof value === "string" && value.length <= maxLength);

const isOptionalEnum = (value: unknown, allowed: readonly string[]) =>
  value === undefined ||
  (typeof value === "string" && allowed.includes(value));

const isOptionalArrowhead = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" &&
    ["arrow", "dot", "bar", "triangle"].includes(value));

const isSafeDropShadow = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    isOptionalBoundedNumber(value.blur, 0, 10_000) &&
    value.blur !== undefined &&
    isSafeCoordinate(value.offsetX) &&
    isSafeCoordinate(value.offsetY) &&
    isOptionalSafeNumber(value.spread) &&
    typeof value.color === "string" &&
    value.color.length <= MAX_STYLE_VALUE_LENGTH);

const hasSafeShapeText = (value: Record<string, unknown>) =>
  isOptionalString(value.text, MAX_ELEMENT_TEXT_LENGTH) &&
  isOptionalBoundedNumber(value.fontSize, 1, 10_000) &&
  isOptionalString(value.fontFamily, MAX_STYLE_VALUE_LENGTH) &&
  isOptionalEnum(value.textAlign, ["left", "center", "right"]) &&
  isOptionalBoundedNumber(value.lineHeight, 0.1, 100) &&
  isOptionalString(value.highlightColor, MAX_STYLE_VALUE_LENGTH) &&
  isOptionalEnum(value.fontWeight, ["normal", "bold"]) &&
  isOptionalEnum(value.fontStyle, ["normal", "italic"]) &&
  isOptionalEnum(value.textDecoration, [
    "none",
    "underline",
    "line-through",
  ]);

const copyElementOverrides = (
  value: Record<string, unknown>,
  type: NoteboardElement["type"],
) => {
  const overrides: Record<string, unknown> = {};
  for (const key of [...COMMON_ELEMENT_KEYS, ...TYPE_ELEMENT_KEYS[type]]) {
    if (value[key] !== undefined) overrides[key] = value[key];
  }

  if (Array.isArray(value.points)) {
    overrides.points = value.points.map((point) => {
      const safePoint = point as Record<string, unknown>;
      return safePoint.pressure === undefined
        ? { x: safePoint.x, y: safePoint.y }
        : { x: safePoint.x, y: safePoint.y, pressure: safePoint.pressure };
    });
  }
  for (const key of ["startBinding", "endBinding"] as const) {
    const binding = value[key];
    if (isRecord(binding)) {
      const fixedPoint = binding.fixedPoint as Record<string, unknown>;
      overrides[key] = {
        elementId: binding.elementId,
        fixedPoint: { x: fixedPoint.x, y: fixedPoint.y },
      };
    }
  }
  if (isRecord(value.dropShadow)) {
    overrides.dropShadow = {
      blur: value.dropShadow.blur,
      offsetX: value.dropShadow.offsetX,
      offsetY: value.dropShadow.offsetY,
      color: value.dropShadow.color,
      ...(value.dropShadow.spread === undefined
        ? {}
        : { spread: value.dropShadow.spread }),
    };
  }
  if (Array.isArray(value.childIds)) {
    overrides.childIds = [...value.childIds];
  }

  return overrides as Partial<NoteboardElement>;
};

const normalizeNoteboardElement = (
  value: unknown,
): NoteboardElement | null => {
  if (!isRecord(value)) return null;
  if (
    !isSafeElementId(value.id) ||
    typeof value.type !== "string" ||
    !NOTEBOARD_ELEMENT_TYPES.has(value.type as NoteboardElement["type"]) ||
    !isSafeCoordinate(value.x) ||
    !isSafeCoordinate(value.y) ||
    !isSafeCoordinate(value.width) ||
    !isSafeCoordinate(value.height)
  ) {
    return null;
  }

  if (
    !isOptionalSafeNumber(value.angle) ||
    !isOptionalBoundedNumber(value.opacity, 0, 100) ||
    !isOptionalBoundedNumber(value.roughness, 0, 100) ||
    !isOptionalBoundedNumber(value.strokeWidth, 0, 10_000) ||
    !isOptionalElementSeed(value.seed) ||
    !isOptionalBoolean(value.isDeleted) ||
    !isOptionalBoolean(value.locked) ||
    !isOptionalString(value.strokeColor, MAX_STYLE_VALUE_LENGTH) ||
    !isOptionalString(value.backgroundColor, MAX_STYLE_VALUE_LENGTH) ||
    !isOptionalEnum(value.fillStyle, [
      "solid",
      "hachure",
      "cross-hatch",
      "none",
    ]) ||
    !isOptionalEnum(value.strokeStyle, ["solid", "dashed", "dotted"]) ||
    !isOptionalEnum(value.blendMode, [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
    ]) ||
    (value.groupId !== undefined && !isSafeElementId(value.groupId)) ||
    !isSafeDropShadow(value.dropShadow)
  ) {
    return null;
  }

  const type = value.type as NoteboardElement["type"];

  if (["line", "arrow", "draw", "pen"].includes(type)) {
    if (
      !Array.isArray(value.points) ||
      value.points.length > MAX_ELEMENT_POINTS ||
      !value.points.every(isSafePoint)
    ) {
      return null;
    }
  }

  if (
    [
      "rectangle",
      "ellipse",
      "diamond",
      "triangle",
      "text",
      "star",
      "sticky-note",
      "callout",
    ].includes(type) &&
    !hasSafeShapeText(value)
  ) {
    return null;
  }

  if (
    (type === "rectangle" &&
      !isOptionalBoundedNumber(
        value.borderRadius,
        0,
        MAX_ABSOLUTE_BOARD_COORDINATE,
      )) ||
    (type === "text" && !isOptionalSafeNumber(value.baseline)) ||
    (type === "pen" &&
      (!isOptionalBoolean(value.highlighter) ||
        !isOptionalBoundedNumber(value.tension, 0, 1))) ||
    (type === "star" &&
      ((value.sides !== undefined &&
        (!Number.isInteger(value.sides) ||
          (value.sides as number) < 3 ||
          (value.sides as number) > 12)) ||
        !isOptionalBoolean(value.isStar) ||
        !isOptionalBoundedNumber(value.innerRadius, 0, 1))) ||
    (type === "sticky-note" &&
      !isOptionalString(value.noteColor, MAX_STYLE_VALUE_LENGTH)) ||
    (type === "callout" &&
      !isOptionalEnum(value.tailDirection, [
        "bottom-left",
        "bottom-right",
        "top-left",
        "top-right",
      ]))
  ) {
    return null;
  }

  if (
    (type === "line" || type === "arrow") &&
    (!isOptionalEnum(value.curveType, ["straight", "curve"]) ||
      !isOptionalEnum(value.routing, ["straight", "curve", "orthogonal"]) ||
      !isOptionalArrowhead(value.startArrowhead) ||
      !isOptionalArrowhead(value.endArrowhead) ||
      !isOptionalString(value.label, MAX_ELEMENT_TEXT_LENGTH) ||
      !isOptionalBoundedNumber(value.labelFontSize, 1, 10_000) ||
      !isOptionalString(value.labelFontFamily, MAX_STYLE_VALUE_LENGTH) ||
      !isSafeBinding(value.startBinding) ||
      !isSafeBinding(value.endBinding))
  ) {
    return null;
  }

  if (
    type === "frame" &&
    (!isOptionalString(value.name, MAX_ELEMENT_TEXT_LENGTH) ||
      !isOptionalString(value.frameColor, MAX_STYLE_VALUE_LENGTH) ||
      !isOptionalBoolean(value.showLabel) ||
      (value.childIds !== undefined &&
        (!Array.isArray(value.childIds) ||
          value.childIds.length > MAX_BOARD_ELEMENTS ||
          !value.childIds.every(isSafeElementId))))
  ) {
    return null;
  }

  if (
    type === "image" &&
    (typeof value.dataUrl !== "string" ||
      value.dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH ||
      !/^data:image\/[a-z0-9.+-]+;base64,/i.test(value.dataUrl))
  ) {
    return null;
  }

  // Reapply current defaults for older boards while ensuring unknown fields
  // cannot hitch a ride into renderer state or the next Yjs update.
  return createElement(type, copyElementOverrides(value, type));
};

export function sanitizeNoteboardElements(value: unknown): NoteboardElement[] {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  const elements: NoteboardElement[] = [];
  for (const candidate of value.slice(0, MAX_BOARD_ELEMENTS)) {
    const element = normalizeNoteboardElement(candidate);
    if (!element || seenIds.has(element.id)) continue;
    seenIds.add(element.id);
    elements.push(element);
  }
  return elements;
}

export function sanitizeNoteboardViewport(value: unknown): NoteboardViewport {
  const viewport = isRecord(value) ? value : {};
  const rawZoom = isSafeCoordinate(viewport.zoom) ? viewport.zoom : 1;
  return {
    panX: isSafeCoordinate(viewport.panX) ? viewport.panX : 0,
    panY: isSafeCoordinate(viewport.panY) ? viewport.panY : 0,
    zoom: Math.min(5, Math.max(0.1, rawZoom)),
  };
}

export function isNoteFavorited(note: BaseNote, userId: string): boolean {
  return note.favoritedBy?.includes(userId) ?? false;
}

export function noteMatchesSearch(note: Note, search: string): boolean {
  if (!search) return true;
  const term = search.toLowerCase();

  if ((note.title || "").toLowerCase().includes(term)) return true;

  if (note.type === NoteType.Document) {
    const content = note.content || "";
    if (typeof content === "string" && content.toLowerCase().includes(term))
      return true;
  } else if (note.type === NoteType.Whiteboard) {
    let elements: NoteboardElement[] = [];
    if (note.content) {
      if (typeof note.content === "string") {
        try {
          const parsed: unknown = JSON.parse(note.content);
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "elements" in parsed &&
            Array.isArray(parsed.elements)
          ) {
            elements = sanitizeNoteboardElements(parsed.elements);
          }
        } catch {
          // ignore
        }
      } else {
        elements = sanitizeNoteboardElements(note.content.elements);
      }
    }

    for (const el of elements) {
      if (
        typeof el === "object" &&
        el !== null &&
        "text" in el &&
        typeof el.text === "string" &&
        el.text.toLowerCase().includes(term)
      ) {
        return true;
      }
    }
  }

  return false;
}
