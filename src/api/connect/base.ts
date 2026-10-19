export abstract class BaseConnect {
    abstract connect(token: string): Promise<ConnectResult>
    abstract send(method: string, request: object): Promise<any>
    abstract setUrl(url: string): void
}

export interface ConnectResult {
  ok: boolean
  message: string
  sessionCount?: number
}