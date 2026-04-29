export interface JsonStore<T> {
  load(): Promise<T>;
  save(value: T): Promise<void>;
}

export interface JsonlStore<T> {
  append(value: T): Promise<void>;
  read(options?: { last?: number }): Promise<T[]>;
  trim(options: { keepLast: number }): Promise<void>;
}

export interface Storage {
  json<T>(name: string, options?: { defaults?: T }): JsonStore<T>;
  jsonl<T>(name: string): JsonlStore<T>;
}

export interface RawBackend {
  read(name: string): Promise<string | undefined>;
  write(name: string, content: string): Promise<void>;
  append(name: string, line: string): Promise<void>;
  readLines(name: string, options?: { last?: number }): Promise<string[]>;
  trimLines(name: string, keepLast: number): Promise<void>;
}
