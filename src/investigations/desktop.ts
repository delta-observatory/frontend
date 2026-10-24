export type ProviderName='codex'|'claude';
export interface DesktopEvent {event:string;provider?:ProviderName;state?:string;text?:string;message?:string;tokens?:number;turns?:number;success?:boolean;name?:string;error?:string}
export interface SavedSession {id:string;campaign_id:string;document:{provider:ProviderName;state:string;model:string;turns:number;tokens:number}}
export interface ProviderLogin {verificationUrl?:string;authUrl?:string;userCode?:string;loginId?:string;type:string}
export interface ProviderStatus {provider:ProviderName;initialized:boolean;credential_store:'ephemeral'|'keyring'|'provider'|null;account:{type:string;email?:string;planType?:string}|null;session:SavedSession|null;campaign_id:string|null;login:ProviderLogin|null}
export interface Model {id:string;model:string;displayName:string;isDefault:boolean}
interface Bridge {agent:<T=unknown>(action:string,params?:unknown)=>Promise<T>;onAgentEvent:(callback:(event:DesktopEvent)=>void)=>(()=>void);settings:<T=unknown>(action:string,params?:unknown)=>Promise<T>;signIn:()=>Promise<{token:string}>;signOut:()=>Promise<void>}
declare global {interface Window {deltaDesktop?:Bridge}}
