import type { ReactNode } from "react";
export interface Schema { type?: string | string[]; title?: string; description?: string; default?: unknown; const?: unknown; enum?: unknown[]; properties?: Record<string, Schema>; additionalProperties?: Schema|boolean; items?: Schema; required?: string[]; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; minItems?:number; anyOf?: Schema[]; oneOf?:Schema[]; allOf?:Schema[]; $ref?: string }
export const label = (name: string) => name.replaceAll("_", " ");
export function normalize(schema:Schema):Schema {
 if(!schema.allOf)return schema;
 const base={...schema};delete base.allOf;
 return schema.allOf.reduce((result,part)=>{const s=normalize(part);return {...result,...s,properties:{...result.properties,...s.properties},required:[...new Set([...(result.required??[]),...(s.required??[])])]};},base);
}
export function resolve(schema:Schema,document:unknown,seen:string[]=[]):Schema {
 if(Array.isArray(schema))return schema.map(s=>resolve(s,document,seen)) as unknown as Schema;
 if(!schema||typeof schema!=="object")return schema;
 if(schema.$ref){if(!schema.$ref.startsWith('#/')||seen.includes(schema.$ref))return {type:'string',description:'This recursive field requires a supported record form.'};let target=document;for(const part of schema.$ref.slice(2).split('/'))target=(target as Record<string,unknown>)[part.replaceAll('~1','/').replaceAll('~0','~')];return resolve(target as Schema,document,[...seen,schema.$ref]);}
 return Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,v&&typeof v==='object'?resolve(v as Schema,document,seen):v]));
}
export function initial(source: Schema): unknown {
 const schema=normalize(source);
 if(schema.default!==undefined)return structuredClone(schema.default);
 if(schema.const!==undefined)return schema.const;
 if(schema.enum)return schema.enum[0];
 const variants=schema.oneOf??schema.anyOf;
 if(variants)return initial(variants.find(s=>s.type!=='null')??variants[0]!);
 if(Array.isArray(schema.type))return initial({...schema,type:schema.type.find(t=>t!=='null')??'null'});
 if(schema.type==='null')return null;
 if(schema.type==='object'||schema.properties)return Object.fromEntries(Object.entries(schema.properties??{}).filter(([k,s])=>schema.required?.includes(k)||s.default!==undefined||s.const!==undefined).map(([k,s])=>[k,initial(s)]));
 if(schema.type==='array')return Array.from({length:schema.minItems??0},()=>initial(schema.items??{type:'string'}));
 if(schema.type==='boolean')return false;
 if(schema.type==='integer'||schema.type==='number')return schema.minimum??0;
 return '';
}
function matches(s:Schema,value:unknown):boolean {
 if(s.const!==undefined)return s.const===value;
 if(s.enum)return s.enum.includes(value);
 if(s.properties&&value&&typeof value==='object'&&!Array.isArray(value))return Object.entries(s.properties).every(([k,field])=>field.const===undefined||(value as Record<string,unknown>)[k]===field.const);
 return s.type==='null'?value===null:s.type==='array'?Array.isArray(value):s.type==='integer'?typeof value==='number'&&Number.isInteger(value):s.type==='object'?typeof value==='object'&&value!==null:typeof value===s.type;
}
export function SchemaForm({schema:source,value,onChange,name='',disabled=false}: {schema:Schema;value:unknown;onChange:(value:unknown)=>void;name?:string;disabled?:boolean}):ReactNode {
 const generic:Schema={oneOf:[{type:'string'},{type:'number'},{type:'boolean'},{type:'object',additionalProperties:true},{type:'array',items:{}}]};
 const s=normalize(Object.keys(source).length?source:generic),title=s.title??label(name);
 const variants=s.oneOf??s.anyOf??(Array.isArray(s.type)?s.type.map(type=>({...s,type})):undefined);
 if(variants){const selected=Math.max(0,variants.findIndex(v=>matches(v,value)));return <fieldset className="schema-group" disabled={disabled}><legend>{title}</legend><label className="schema-field">Value type<select value={selected} onChange={e=>onChange(initial(variants[Number(e.target.value)]!))}>{variants.map((v,i)=><option value={i} key={i}>{v.title??String(v.const??v.type??`Option ${i+1}`)}</option>)}</select></label><SchemaForm schema={variants[selected]!} value={value} onChange={onChange} disabled={disabled}/></fieldset>;}
 if(s.const!==undefined)return <small>{title}: {String(s.const)}</small>;
 if(s.type==='null')return <small>No value</small>;
 if(s.type==='object'||s.properties){const record=(value??{}) as Record<string,unknown>,known=s.properties??{};return <fieldset className="schema-group" disabled={disabled}>{title&&<legend>{title}</legend>}{Object.entries(known).map(([k,child])=>{const required=s.required?.includes(k)||child.const!==undefined,exists=k in record;return <div key={k}>{!required&&<label><input type="checkbox" checked={exists} onChange={e=>{const next={...record};if(e.target.checked)next[k]=initial(child);else delete next[k];onChange(next);}}/>Include {label(k)}</label>}{(required||exists)&&<SchemaForm name={k} schema={child} value={record[k]} disabled={disabled} onChange={v=>onChange({...record,[k]:v})}/>}</div>;})}{s.additionalProperties!==false&&<>{Object.entries(record).filter(([k])=>!(k in known)).map(([k,v])=><div className="array-item" key={k}><SchemaForm name={k} schema={typeof s.additionalProperties==='object'?s.additionalProperties:{}} value={v} onChange={v=>onChange({...record,[k]:v})}/><button type="button" onClick={()=>{const next={...record};delete next[k];onChange(next);}}>Remove</button></div>)}<label className="schema-field">Additional field name<input placeholder="Name, then press Enter" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();const k=e.currentTarget.value.trim();if(k&&!(k in record)&&!['__proto__','prototype','constructor'].includes(k)){onChange({...record,[k]:initial(typeof s.additionalProperties==='object'?s.additionalProperties:{type:'string'})});e.currentTarget.value='';}}}}/></label></>}</fieldset>;}
 if(s.type==='array'){const values=Array.isArray(value)?value:[];return <fieldset className="schema-group" disabled={disabled}><legend>{title}</legend>{values.map((v,i)=><div className="array-item" key={i}><SchemaForm schema={s.items??{type:'string'}} value={v} name={`${i+1}`} onChange={next=>onChange(values.map((x,j)=>i===j?next:x))}/><button type="button" onClick={()=>onChange(values.filter((_,j)=>i!==j))}>Remove</button></div>)}<button type="button" onClick={()=>onChange([...values,initial(s.items??{type:'string'})])}>Add {title||'item'}</button></fieldset>;}
 return <label className="schema-field" title={s.description}><span>{title}</span>{s.enum?<select disabled={disabled} value={String(value??s.enum[0])} onChange={e=>onChange(s.enum!.find(x=>String(x)===e.target.value))}>{s.enum.map(x=><option key={String(x)} value={String(x)}>{String(x)}</option>)}</select>:s.type==='boolean'?<input type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={e=>onChange(e.target.checked)}/>:<input disabled={disabled} type={s.type==='integer'||s.type==='number'?'number':'text'} min={s.minimum} max={s.maximum} maxLength={s.maxLength} step={s.type==='integer'?1:'any'} value={String(value??'')} onChange={e=>onChange(s.type==='integer'||s.type==='number'?Number(e.target.value):e.target.value)}/>} {s.description&&<small>{s.description}</small>}</label>;
}
