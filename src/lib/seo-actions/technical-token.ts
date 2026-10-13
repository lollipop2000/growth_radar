import {normalizeQuery} from '../search/model';

// Exact formatting equivalence only. Never normalize general query identity.
const viscosity=/(?<![\p{L}\p{N}])([0-9]+)\s*w\s*[-–]?\s*([0-9]+)(?![\p{L}\p{N}])/giu;
const packaging=/(?<![\p{L}\p{N}.,])(\d+(?:[.,]\d+)?)\s*(л(?:итр(?:а|ов)?)?|l|кг|kg)(?![\p{L}\p{N}])/giu;
const grade=/(?<![\p{L}\p{N}])((?:iso\s*(?:vg\s*)?|hvlp\s*|hlp\s*|vg\s*))(\d+)(?:[.,]0+)?(?![\p{L}\p{N}.,])/giu;
function numeric(value:string){return value.replace(',','.').replace(/\.0+$/,'').replace(/(\.\d*?[1-9])0+$/,'$1');}
export function normalizeTechnicalText(text:string){return normalizeQuery(text)
 .replace(/(?<![\p{L}\p{N}])sae\s*(?=\d+\s*w)/giu,'sae ')
 .replace(viscosity,(_,winter:string,summer:string)=>`${winter}w-${summer}`)
 .replace(packaging,(_,value:string,unit:string)=>`${numeric(value)} ${/^(?:kg|кг)$/i.test(unit)?'кг':'л'}`)
 .replace(grade,(_,prefix:string,value:string)=>`${prefix.trim().replace(/\s+/g,' ')} ${value}`);}
export function normalizeTechnicalToken(token:string){return normalizeTechnicalText(token);}
export function technicalContains(text:string,token:string):boolean|null {
 const value=normalizeTechnicalToken(token);
 // Bare numbers have no specification semantics and are deliberately excluded.
 if(!/^(?:\d+w-\d+|\d+(?:\.\d+)? (?:л|кг)|(?:iso(?: vg)?|hvlp|hlp|vg) \d+|gl-\d+|atf [ivx]+|api [a-z]{2}|acea [a-z]\d+|sae \d+w-\d+)$/.test(value))return null;
 const escaped=value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp(`(?<![\\p{L}\\p{N}]|\\d[.,])${escaped}(?![\\p{L}\\p{N}]|[.,]\\d)`,'u').test(normalizeTechnicalText(text));
}
