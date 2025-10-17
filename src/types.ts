// Base Types

export type BaseExpression<T = unknown> = string;
export type BaseLambda<T = unknown> = BaseExpression<T>;

export type BaseFilterLiteral = string;

export interface BaseFilterCompound {
  readonly and?: ReadonlyArray<BaseFilter>;
  readonly or?: ReadonlyArray<BaseFilter>;
  readonly not?: ReadonlyArray<BaseFilter>;
}

export type BaseFilter = BaseFilterLiteral | BaseFilterCompound;

export interface BasePropertyConfig {
  readonly displayName?: string;
  readonly [key: string]: unknown;
}

export type BasePropertyMap = Record<string, BasePropertyConfig>;

export interface BaseView {
  readonly type: string;
  readonly name?: string;
  readonly limit?: number;
  readonly filters?: BaseFilter;
  readonly order?: ReadonlyArray<string>;
  readonly [key: string]: unknown;
}

export type BaseFormulaMap = Record<string, BaseExpression>;

export interface ObsidianBaseDefinition {
  readonly filters?: BaseFilter;
  readonly formulas?: BaseFormulaMap;
  readonly properties?: BasePropertyMap;
  readonly views?: ReadonlyArray<BaseView>;
}

// Vault Files

export interface VaultLink {
  readonly raw: string;
  readonly target: string;
  readonly display?: string;
  readonly isEmbed: boolean;
  resolvedPath?: string;
}

export interface VaultFile {
  readonly path: string;
  readonly relativePath: string;
  readonly name: string;
  readonly ext: string;
  readonly folder: string;
  readonly stat: Deno.FileInfo;
  readonly frontmatter?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly properties?: Record<string, unknown>;
  readonly content?: string;
  readonly tags?: ReadonlyArray<string>;
  readonly links?: ReadonlyArray<VaultLink>;
  readonly embeds?: ReadonlyArray<VaultLink>;
  backlinks: string[];
}

// Expression Types

export type ExpressionBoolean = boolean;
export type ExpressionNumber = number;
export type ExpressionString = string;
export type ExpressionNull = null;

export type ExpressionPrimitive =
  | ExpressionBoolean
  | ExpressionNumber
  | ExpressionString
  | ExpressionNull;

export type ExpressionDuration = number;

export interface ExpressionImage {
  readonly source: ExpressionString | ExpressionFile | ExpressionLink;
}

export interface ExpressionIcon {
  readonly name: string;
}

export interface ExpressionRegularExpression extends RegExp {
  matches(value: ExpressionString | string): boolean;
}

export interface ExpressionDate extends Date {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
  date(): ExpressionDate;
  format(format: ExpressionString | string): ExpressionString;
  time(): ExpressionString;
  relative(): ExpressionString;
  isEmpty(): boolean;
}

export interface ExpressionList<T = ExpressionValue> {
  readonly length: number;
  readonly [index: number]: T;
  contains(value: ExpressionValue): boolean;
  containsAll(...values: ReadonlyArray<ExpressionValue>): boolean;
  containsAny(...values: ReadonlyArray<ExpressionValue>): boolean;
  isEmpty(): boolean;
  join(separator: ExpressionString | string): ExpressionString;
  reverse(): ExpressionList<T>;
  sort(): ExpressionList<T>;
  flat(): ExpressionList<ExpressionValue>;
  unique(): ExpressionList<T>;
  slice(start: number, end?: number): ExpressionList<T>;
  map(mapper: BaseLambda): ExpressionList<ExpressionValue>;
  filter(predicate: BaseLambda): ExpressionList<T>;
}

export interface ExpressionLink {
  readonly path: ExpressionString | string;
  readonly display?: ExpressionValue;
  readonly isEmbed?: boolean;
  linksTo(
    file: ExpressionFile | ExpressionLink | ExpressionString | string,
  ): boolean;
  asFile(): ExpressionFile | null;
}

export interface ExpressionObject {
  readonly [key: string]: ExpressionValue;
  isEmpty(): boolean;
  keys(): ExpressionList<ExpressionString>;
  values(): ExpressionList<ExpressionValue>;
}

export interface ExpressionFile {
  readonly backlinks?: ExpressionList<ExpressionFile>;
  readonly ctime?: ExpressionDate;
  readonly embeds?: ExpressionList<ExpressionLink>;
  readonly ext?: ExpressionString;
  readonly file?: ExpressionFile;
  readonly folder?: ExpressionString;
  readonly links?: ExpressionList<ExpressionLink>;
  readonly mtime?: ExpressionDate;
  readonly name?: ExpressionString;
  readonly path?: ExpressionString;
  readonly properties?: ExpressionObject;
  readonly size?: ExpressionNumber;
  readonly tags?: ExpressionList<ExpressionString>;
  asLink(display?: ExpressionString | string): ExpressionLink;
  hasLink(
    otherFile: ExpressionFile | ExpressionLink | ExpressionString | string,
  ): boolean;
  hasProperty(name: ExpressionString | string): boolean;
  hasTag(...values: ReadonlyArray<ExpressionString | string>): boolean;
  inFolder(folder: ExpressionString | string): boolean;
}

export type ExpressionAny = ExpressionValue;

export type ExpressionValue =
  | ExpressionPrimitive
  | ExpressionDate
  | ExpressionDuration
  | ExpressionImage
  | ExpressionIcon
  | ExpressionList
  | ExpressionLink
  | ExpressionFile
  | ExpressionObject
  | ExpressionRegularExpression;

export interface ExpressionGlobals {
  readonly today: () => Date;
  readonly now: () => Date;
  readonly date: (input: string | Date) => Date;
  readonly duration: (value: string) => number;
  readonly file: (path: unknown) => Record<string, unknown>;
  readonly if: <T>(
    condition: unknown,
    trueResult: T,
    falseResult?: T,
  ) => T | null;
  readonly image: (path: unknown) => string;
  readonly icon: (name: string) => string;
  readonly link: (path: unknown, display?: unknown) => Record<string, unknown>;
  readonly list: (value: unknown) => ReadonlyArray<unknown>;
  readonly max: (...values: ReadonlyArray<number>) => number;
  readonly min: (...values: ReadonlyArray<number>) => number;
  readonly number: (input: unknown) => number;
}
