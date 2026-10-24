import {showTokenInfo} from './token-info.js';
import { initLocale } from './locale.js';

initLocale({ titleZh: 'Agent 接入指南 · ID FUN', titleEn: 'Agent Setup Guide · ID FUN' });

fetch('/api/config').then(r=>{if(!r.ok)throw Error('config unavailable');return r.json()}).then(showTokenInfo).catch(()=>{});
