/**
 * ali-oss 没有随包提供类型声明（@types/ali-oss 版本陈旧且不完整），
 * 这里按本项目实际用到的方法补一份最小声明。
 */
declare module "ali-oss" {
  interface OSSOptions {
    region: string;
    bucket: string;
    accessKeyId: string;
    accessKeySecret: string;
    secure?: boolean;
  }

  interface PutOptions {
    headers?: Record<string, string>;
  }

  interface GetResult {
    content: Buffer | string;
    res: { status: number; headers: Record<string, string> };
  }

  interface HeadResult {
    res: { status: number; headers: Record<string, string> };
  }

  interface ListQuery {
    prefix?: string;
    marker?: string;
    delimiter?: string;
    "max-keys"?: number;
  }

  interface ListResult {
    objects: { name: string; url: string }[] | null;
    prefixes: string[] | null;
    nextMarker: string | null;
    isTruncated: boolean;
  }

  export default class OSS {
    constructor(options: OSSOptions);
    put(
      name: string,
      content: Buffer | string,
      options?: PutOptions,
    ): Promise<{ name: string; url: string; res: { status: number } }>;
    get(name: string, options?: { headers?: Record<string, string> }): Promise<GetResult>;
    head(name: string): Promise<HeadResult>;
    delete(name: string): Promise<{ res: { status: number } }>;
    list(query: ListQuery, options?: unknown): Promise<ListResult>;
  }
}
