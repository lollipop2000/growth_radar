import type {AiActionProposal} from '../../src/lib/ai/contract';
// Authored synthetic fixtures, never captured model outputs.
export const specificityCases:{id:string;type:AiActionProposal['actionType'];text:string;reasons:string[]}[]=[
 {id:'description-synonym-short',type:'CHECK',text:'Проверить краткое описание.',reasons:[]},
 {id:'description-announcement',type:'CHECK',text:'Сверить анонс в HTML с назначением страницы контактов.',reasons:[]},
 {id:'description-snippet',type:'CHECK',text:'Оценить понятность сниппета для профессионального покупателя.',reasons:[]},
 {id:'description-field',type:'CHECK',text:'Убедиться, что поле в HTML отражает способы связи.',reasons:[]},
 {id:'description-nominal',type:'CHECK',text:'Проверка краткого описания в исходном HTML.',reasons:[]},
 {id:'description-change-synonym',type:'CHANGE',text:'Подготовить анонс со способами связи и реквизитами компании.',reasons:[]},
 {id:'short-concrete-h1',type:'CHECK',text:'Проверить H1',reasons:[]},
 {id:'title-change-short',type:'CHANGE',text:'Уточнить заголовок',reasons:[]},
 {id:'title-change-inversion',type:'CHANGE',text:'Заголовок отредактировать для ясности назначения страницы.',reasons:[]},
 {id:'commerce-path-synonym',type:'CHECK',text:'Изучить процедуру оформления для юридического лица без отправки форм.',reasons:[]},
 {id:'commerce-visibility-synonym',type:'CHECK',text:'Осмотреть расположение коммерческих элементов на мобильном экране.',reasons:[]},
 {id:'commerce-conditions-synonym',type:'CHECK',text:'Сверить условия заказа с информацией для профессионального покупателя.',reasons:[]},
 {id:'short-fragment',type:'CHECK',text:'Правка',reasons:['ACTION_TOO_SHORT','ACTION_NOT_ACTIONABLE']},
 {id:'blank-fragment',type:'CHECK',text:' ',reasons:['ACTION_TOO_SHORT','ACTION_NOT_ACTIONABLE']},
 {id:'generic-short-seo',type:'CHANGE',text:'Улучшить SEO',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'generic-long-seo',type:'CHANGE',text:'Улучшить SEO страницы и сделать её более качественной и эффективной.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'generic-check-seo',type:'CHECK',text:'Проверить SEO страницы.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'operation-no-object',type:'CHECK',text:'Проверить всё внимательно и качественно.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'abstract-object',type:'CHECK',text:'Оценить качество.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'object-no-operation',type:'CHECK',text:'Краткое описание страницы для профессионального покупателя.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'negated-operation',type:'CHECK',text:'Не проверять краткое описание страницы.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'disconnected-sentences',type:'CHANGE',text:'Подготовить улучшения. Текст для покупателя.',reasons:['ACTION_NOT_ACTIONABLE']},
 {id:'check-smuggles-change',type:'CHECK',text:'Подготовить анонс страницы для покупателя.',reasons:['ACTION_NOT_ACTIONABLE']}
];
export const specificityProposal=(text:string,type:AiActionProposal['actionType']='CHECK'):AiActionProposal=>({contextId:'CTX_01',actionType:type,area:'DESCRIPTION',proposedAction:text,rationale:'Поможет сопоставить назначение страницы с информацией для профессионального покупателя.'});
