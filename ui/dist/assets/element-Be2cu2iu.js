const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./srt-parser-BfIkQynj.js","./pool-4cw4TIPd.js","./index-hQV2QEm5.js","./index-DXApiTxV.css","./libav-B-yy2qPJ.js","./ssa-parser-eVcLy5ud.js","./errors-9qZLU_Dk.js"])))=>i.map(i=>d[i]);
import{p as R,l as wt,s as w,r as fi,t as I,_ as _t,u as H,d as pi,o as x,a as ut,b as mi,c as gi,e as ot,f as m,n as M,i as bi,g as yi,h as wi,S as J,j as ht,k as vi,m as at,q as Mt,v as ke,w as Ai,x as X,y as ki,z as u,E as T,O as xi,A as b,M as f,B as W,C as xe,D as _,F as zt,G as Si,H as Ti,I as Rt,J as Ei,K as Wt}from"./pool-4cw4TIPd.js";import{_ as It}from"./index-hQV2QEm5.js";import{u as k,R as ct,i as Mi,D as Ri,a as qt,b as Ht,A as Ii,F as Oi,d as Ci,c as Li,T as _i,e as zi,P as vt,f as Ni,p as Gt,t as U,g as Nt,h as Vt,s as Bi,j as N}from"./libav-B-yy2qPJ.js";const ji=["legacy","cmaf","loc"],Di=R(wt({kind:w().check(fi(t=>!ji.includes(t),{message:"recognized container kind must match its own schema"}))}),I(t=>({kind:"unknown",raw:t}))),Bt=_t(H([pi("kind",[x({kind:ut("legacy")}),x({kind:ut("cmaf"),init:mi()}),x({kind:ut("loc")})]),Di]),{kind:"legacy"});function Se(t){return t.kind!=="unknown"}const Te=w().check(gi(/^([0-9a-fA-F]{2})*$/,"expected hex")),Fi=x({name:w()}),Yt=x({broadcast:m(ct),label:m(w()),codec:w(),container:Bt,description:m(Te),sampleRate:k,numberOfChannels:k,bitrate:m(k),jitter:m(R(k,I(t=>t===0?void 0:t))),delay:m(R(k,I(t=>t===0?void 0:t)))}),Ui=H([x({renditions:ot(w(),Yt)}),R(x({track:Fi,config:Yt}),I(t=>({renditions:{[t.track.name]:t.config}})))]),Ee=w(),Me=w(),Pi=wt({broadcast:m(ct),mode:Me,compression:m(Ee),mime:m(w()),bitrate:m(k),jitter:m(R(k,I(t=>t===0?void 0:t))),delay:m(R(k,I(t=>t===0?void 0:t)))}),$i=x({tracks:ot(w(),Pi)}),Wi=M().check(bi(),yi(),wi(4294967295)),qi=x({wall:k,timescale:_t(Wi,1e6)}),Hi=wt({broadcast:m(ct),mode:Me,compression:m(Ee),schema:m(w()),bitrate:m(k),jitter:m(R(k,I(t=>t===0?void 0:t))),delay:m(R(k,I(t=>t===0?void 0:t)))}),Gi=x({tracks:ot(w(),Hi)});class Vi extends Error{constructor(){super("delta before snapshot"),this.name="MissingSnapshot"}}class Yi{#t;#e;#n;#i;#s=0;constructor(e={}){this.#t=e.schema,this.#e=Mi(e.compression)}snapshot(e){this.#n=this.#e?new Ri:void 0;const i=this.#r(e);this.#i=this.#a(i),this.#s=i.byteLength}delta(e){if(this.#i===void 0)throw new Vi;const[i,n]=Ot(this.#i,this.#a(this.#r(e)));if(this.#i=i,this.#s+=n,this.#s>qt)throw this.#i=void 0,new Error(`reconstructed value exceeded ${qt} bytes`)}get value(){return this.#i===void 0?void 0:structuredClone(this.#i)}decode(){if(this.#i!==void 0)return this.#t?this.#t.parse(this.#i):structuredClone(this.#i)}#r(e){return this.#n?this.#n.frame(e):e}#a(e){return JSON.parse(new TextDecoder().decode(e))}}const Ki=new TextEncoder;function V(t){return t===void 0?0:Ki.encode(JSON.stringify(t)).byteLength}function Ot(t,e){if(!Ht(e))return[e,V(e)-V(t)];let i=0,n;Ht(t)?n=t:(n={},i+=2-V(t));for(const[s,r]of Object.entries(e)){const a=Object.hasOwn(n,s);if(r===null){if(!a)continue;i-=V(s)+V(n[s])+2,delete n[s]}else if(a){const[o,c]=Ot(n[s],r);n[s]=o,i+=c}else{const[o,c]=Ot(void 0,r);Object.defineProperty(n,s,{value:o,enumerable:!0,writable:!0,configurable:!0}),i+=V(s)+2+c}}return[n,i]}const Ji=[ht.TooFarBehind,ht.Old,ht.Evicted,ht.GroupTooLarge];let Xi=class{#t;#e;#n;#i=0;constructor(e){this.#t=e.track.ordered(),this.#e=new Yi(e)}async next(){for(;;){if(this.#n!==void 0){const n=this.#t.latest();n!==void 0&&n>this.#n.sequence&&(this.#n.close(),this.#n=void 0)}if(!this.#n){const n=this.#t.latest();if(n!==void 0&&this.#t.setGroups({start:{included:n}}),this.#n=await this.#t.nextGroup(),!this.#n)return;this.#i=0}let e=!1;for(let n=this.#n.tryReadFrame();n!==void 0;n=this.#n.tryReadFrame())this.#s(n.payload),e=!0;if(e)return this.#e.decode();let i;try{i=await this.#n.readFrame()}catch(n){if(!(n instanceof J&&Ji.includes(n.code)))throw n;this.#n=void 0;continue}if(i===void 0){this.#n=void 0;continue}return this.#s(i.payload),this.#e.decode()}}async*[Symbol.asyncIterator](){for(;;){const e=await this.next();if(e===void 0)return;yield e}}#s(e){this.#i===0?this.#e.snapshot(e):this.#e.delta(e),this.#i+=1}};function kt(t,e){return m(H([t,R(vi(i=>{if(typeof i!="object"||i===null||!(e in i))return!0;const n=i[e];return typeof n!="object"||n===null||Array.isArray(n)}),I(()=>{}))]))}const Zi=w(),Qi=w(),tn=x({broadcast:m(ct),format:Zi,role:_t(Qi,"subtitle"),lang:m(w()),label:m(w()),container:Bt,jitter:m(R(k,I(t=>t===0?void 0:t))),delay:m(R(k,I(t=>t===0?void 0:t)))}),en=x({renditions:ot(w(),tn)}),nn=x({name:w()}),Kt=x({broadcast:m(ct),label:m(w()),codec:w(),container:Bt,description:m(Te),codedWidth:m(k),codedHeight:m(k),displayAspectWidth:m(k),displayAspectHeight:m(k),framerate:m(M()),bitrate:m(k),stalled:m(at()),optimizeForLatency:m(at()),jitter:m(R(k,I(t=>t===0?void 0:t))),delay:m(R(k,I(t=>t===0?void 0:t)))}),sn=H([x({renditions:ot(w(),Kt),display:m(x({width:k,height:k})),rotation:m(M()),flip:m(at())}),R(Mt(x({track:nn,config:Kt})),I(t=>{const e=t[0]?.config;return{renditions:Object.fromEntries(t.map(i=>[i.track.name,i.config])),display:e?.displayAspectWidth!==void 0&&e?.displayAspectHeight!==void 0?{width:e.displayAspectWidth,height:e.displayAspectHeight}:void 0,rotation:void 0,flip:void 0}}))]),rn=wt({video:m(sn),audio:m(Ui),archive:Ai(m(Ii),void 0),clock:m(qi),text:kt(en,"renditions"),json:kt(Gi,"tracks"),binary:kt($i,"tracks")}),Re=64;class an extends Error{count;constructor(e){super(`catalog has ${e} renditions, over the limit of ${Re}`),this.name="TooManyRenditions",this.count=e}}function Jt(t){const e=Object.keys(t.video?.renditions??{}).length+Object.keys(t.audio?.renditions??{}).length+Object.keys(t.text?.renditions??{}).length;if(e>Re)throw new an(e);return t}class on extends Error{broadcast;constructor(e){super(`catalog broadcast reference escapes the root: ${e}`),this.name="EscapingBroadcast",this.broadcast=e}}function Xt(t,e){const i=[t.video?.renditions,t.audio?.renditions,t.text?.renditions,t.json?.tracks,t.binary?.tracks];for(const n of i)for(const{broadcast:s}of Object.values(n??{}))if(s&&ke(e,s)===void 0)throw new on(s);return t}const cn=8,ln=16,hn=6,Zt=1e6;let jt=class{kind;constructor(e="data"){this.kind=e}end(e){return this.kind!=="data"&&e.payload.byteLength===0?e.timestamp:void 0}decode(e){const[i,n]=X(e);if(n.byteLength<i)throw new Error("loc: properties_length exceeds frame size");const s=n.subarray(0,i),r=n.subarray(i);let a,o,c=0,l=!0,h=s;for(;h.byteLength>0;){const[g,v]=X(h),y=l?g:c+g;if(l=!1,c=y,h=v,y===ln||y===hn)[a,h]=X(h);else if(y===cn){let A;if([A,h]=X(h),A===0)throw new Error("loc: timescale property must be non-zero");o=A}else if(y%2===0)h=ki(h)[1];else{const[A,S]=X(h);if(S.byteLength<A)throw new Error("loc: property length exceeds remaining bytes");h=S.subarray(A)}}if(a===void 0)throw new Error("loc: frame missing required timestamp property");const d=o??Zt,p=Math.round(a*Zt/d);return[{payload:r,timestamp:p,keyframe:!1}]}};function Ie(t){return t instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&t instanceof SharedArrayBuffer}const dn="utf-16",xt="utf-16be",Qt="utf-16le",st="utf-8";function Oe(t,e={}){let i;Ie(t)?i=new DataView(t):i=new DataView(t.buffer,t.byteOffset,t.byteLength);let n=0,{encoding:s}=e;if(!s){const l=i.getUint8(0),h=i.getUint8(1);l==239&&h==187&&i.getUint8(2)==191?(s=st,n=3):l==254&&h==255?(s=xt,n=2):l==255&&h==254?(s=Qt,n=2):s=st}if(typeof TextDecoder<"u")return new TextDecoder(s).decode(i);const{byteLength:r}=i,a=s!==xt;let o="",c;for(;n<r;){switch(s){case st:if(c=i.getUint8(n),c<128)n++;else if(c>=194&&c<=223)if(n+1<r){const l=i.getUint8(n+1);l>=128&&l<=191?(c=(c&31)<<6|l&63,n+=2):n++}else n++;else if(c>=224&&c<=239)if(n+2<=r-1){const l=i.getUint8(n+1),h=i.getUint8(n+2);l>=128&&l<=191&&h>=128&&h<=191?(c=(c&15)<<12|(l&63)<<6|h&63,n+=3):n++}else n++;else if(c>=240&&c<=244)if(n+3<=r-1){const l=i.getUint8(n+1),h=i.getUint8(n+2),d=i.getUint8(n+3);l>=128&&l<=191&&h>=128&&h<=191&&d>=128&&d<=191?(c=(c&7)<<18|(l&63)<<12|(h&63)<<6|d&63,n+=4):n++}else n++;else n++;break;case xt:case dn:case Qt:c=i.getUint16(n,a),n+=2}o+=String.fromCodePoint(c)}return o}const un=["dinf","edts","grpl","mdia","meco","mfra","minf","moof","moov","mvex","schi","sinf","stbl","strk","traf","trak","tref","udta","vttc"];function fn(t){return"boxes"in t||un.includes(t.type)}const te="utf8",B="uint",Ct="template",ee="string",ie="data";function pn(t,e,i){const n=i>0?i:t.byteLength-(e-t.byteOffset);return new Uint8Array(t.buffer,e,Math.max(n,0))}function mn(t,e,i){let n=NaN;const s=e-t.byteOffset;switch(i){case 1:n=t.getInt8(s);break;case 2:n=t.getInt16(s);break;case 4:n=t.getInt32(s);break;case 8:const r=t.getInt32(s),a=t.getInt32(s+4);n=r*Math.pow(2,32)+a}return n}function q(t,e,i){const n=e-t.byteOffset;let s=NaN,r,a;switch(i){case 1:s=t.getUint8(n);break;case 2:s=t.getUint16(n);break;case 3:r=t.getUint16(n),a=t.getUint8(n+2),s=(r<<8)+a;break;case 4:s=t.getUint32(n);break;case 8:r=t.getUint32(n),a=t.getUint32(n+4),s=r*Math.pow(2,32)+a}return s}function ne(t,e,i){let n="";for(let s=0;s<i;s++){const r=q(t,e+s,1);n+=String.fromCharCode(r)}return n}function gn(t,e,i){const n=i/2;return q(t,e,n)+q(t,e+n,n)/Math.pow(2,n)}function bn(t,e){let i="",n=e;for(;n-t.byteOffset<t.byteLength;){const s=q(t,n,1);if(s===0)break;i+=String.fromCharCode(s),n++}return i}function yn(t,e){const i=t.byteLength-(e-t.byteOffset);return i>0?Oe(new DataView(t.buffer,e,i),{encoding:st}):""}function wn(t,e){const i=t.byteLength-(e-t.byteOffset);let n="";if(i>0){const s=new DataView(t.buffer,e,i);let r=0;for(;r<i&&s.getUint8(r)!==0;r++);n=Oe(new DataView(t.buffer,e,r),{encoding:st})}return n}var vn=class Ce{constructor(e,i){this.truncated=!1,this.slice=(n,s)=>{const r=new DataView(this.dataView.buffer,n,s),a=new Ce(r,this.config),o=this.offset-n,c=s-o;return this.offset+=c,a.jump(o),a},this.read=(n,s=0)=>{const{dataView:r,offset:a}=this;let o,c=s;switch(n){case B:o=q(r,a,s);break;case"int":o=mn(r,a,s);break;case Ct:o=gn(r,a,s);break;case ee:s===-1?(o=bn(r,a),c=o.length+1):o=ne(r,a,s);break;case ie:o=pn(r,a,s),c=o.length;break;case te:s===-1?(o=wn(r,a),c=o.length+1):o=yn(r,a);break;default:o=-1}return this.offset+=c,o},this.readUint=n=>this.read(B,n),this.readInt=n=>this.read("int",n),this.readString=n=>this.read(ee,n),this.readTemplate=n=>this.read(Ct,n),this.readData=n=>this.read(ie,n),this.readUtf8=n=>this.read(te,n),this.readFullBox=()=>({version:this.readUint(1),flags:this.readUint(3)}),this.readArray=(n,s,r)=>{const a=[];for(let o=0;o<r;o++)a.push(this.read(n,s));return a},this.jump=n=>{this.offset+=n},this.readBox=()=>{const{dataView:n,offset:s}=this;let r=0;const a=q(n,s,4),o=ne(n,s+4,4),c={size:a,type:o};r+=8,c.size===1&&(c.largesize=q(n,s+r,8),r+=8);const l=c.size===0?this.bytesRemaining:c.largesize??c.size;if(this.cursor+l>n.byteLength)throw this.truncated=!0,new Error("Truncated box");return this.jump(r),o==="uuid"&&(c.usertype=this.readArray("uint",1,16)),c.view=this.slice(s,l),c},this.readBoxes=(n=-1)=>{const s=[];for(const r of this)if(s.push(r),n>0&&s.length>=n)break;return s},this.readEntries=(n,s)=>{const r=[];for(let a=0;a<n;a++)r.push(s());return r},this.dataView=Ie(e)?new DataView(e):e instanceof DataView?e:new DataView(e.buffer,e.byteOffset,e.byteLength),this.offset=this.dataView.byteOffset,this.config=i||{}}get buffer(){return this.dataView.buffer}get byteOffset(){return this.dataView.byteOffset}get byteLength(){return this.dataView.byteLength}get cursor(){return this.offset-this.dataView.byteOffset}get done(){return this.cursor>=this.dataView.byteLength||this.truncated}get bytesRemaining(){return this.dataView.byteLength-this.cursor}*[Symbol.iterator](){const{readers:e={}}=this.config;for(;!this.done;)try{const i=this.readBox(),{type:n,view:s}=i,r=e[n]||e[n.trim()];if(r&&Object.assign(i,r(s,n)),fn(i)&&!i.boxes){const a=[];for(const o of s)a.push(o);i.boxes=a}yield i}catch(i){if(i instanceof Error&&i.message==="Truncated box")break;throw i}}};function Le(t,e){const i=[];for(const n of new vn(t,e))i.push(n);return i}function An(t,e){const{readArray:i,readUint:n,readTemplate:s,readBoxes:r}=e;return{type:t,reserved1:i(B,1,6),dataReferenceIndex:n(2),reserved2:i(B,4,2),channelcount:n(2),samplesize:n(2),preDefined:n(2),reserved3:n(2),samplerate:s(4),boxes:r()}}function Dt(t,e){const{readArray:i,readUint:n,readInt:s,readTemplate:r,readBoxes:a}=e;return{type:t,reserved1:i(B,1,6),dataReferenceIndex:n(2),preDefined1:n(2),reserved2:n(2),preDefined2:i(B,4,3),width:n(2),height:n(2),horizresolution:r(4),vertresolution:r(4),reserved3:n(4),frameCount:n(2),compressorName:i(B,1,32),depth:n(2),preDefined3:s(2),boxes:a()}}function se(t){return Dt("avc1",t)}function kn(t){return{type:"hdlr",...t.readFullBox(),preDefined:t.readUint(4),handlerType:t.readString(4),reserved:t.readArray(B,4,3),name:t.readString(-1)}}function xn(t){return Dt("hev1",t)}function Sn(t){return Dt("hvc1",t)}function Tn(t){return{type:"mdat",data:t.readData(-1)}}function En(t){const{version:e,flags:i}=t.readFullBox(),n=t.readUint(e==1?8:4),s=t.readUint(e==1?8:4),r=t.readUint(4),a=t.readUint(e==1?8:4),o=t.readUint(2);return{type:"mdhd",version:e,flags:i,creationTime:n,modificationTime:s,timescale:r,duration:a,language:String.fromCharCode((o>>10&31)+96,(o>>5&31)+96,(o&31)+96),preDefined:t.readUint(2)}}function Mn(t){return{type:"mfhd",...t.readFullBox(),sequenceNumber:t.readUint(4)}}function Rn(t){return An("mp4a",t)}function In(t){const{version:e,flags:i}=t.readFullBox(),n=t.readUint(4);return{type:"stsd",version:e,flags:i,entryCount:n,entries:t.readBoxes(n)}}function On(t){const{version:e,flags:i}=t.readFullBox();return{type:"tfdt",version:e,flags:i,baseMediaDecodeTime:t.readUint(e==1?8:4)}}function Cn(t){const{version:e,flags:i}=t.readFullBox();return{type:"tfhd",version:e,flags:i,trackId:t.readUint(4),baseDataOffset:i&1?t.readUint(8):void 0,sampleDescriptionIndex:i&2?t.readUint(4):void 0,defaultSampleDuration:i&8?t.readUint(4):void 0,defaultSampleSize:i&16?t.readUint(4):void 0,defaultSampleFlags:i&32?t.readUint(4):void 0}}function Ln(t){const{version:e,flags:i}=t.readFullBox(),n=e===1?8:4;return{type:"tkhd",version:e,flags:i,creationTime:t.readUint(n),modificationTime:t.readUint(n),trackId:t.readUint(4),reserved1:t.readUint(4),duration:t.readUint(n),reserved2:t.readArray(B,4,2),layer:t.readUint(2),alternateGroup:t.readUint(2),volume:t.readTemplate(2),reserved3:t.readUint(2),matrix:t.readArray(Ct,4,9),width:t.readTemplate(4),height:t.readTemplate(4)}}function _n(t){return{type:"trex",...t.readFullBox(),trackId:t.readUint(4),defaultSampleDescriptionIndex:t.readUint(4),defaultSampleDuration:t.readUint(4),defaultSampleSize:t.readUint(4),defaultSampleFlags:t.readUint(4)}}function zn(t){const{version:e,flags:i}=t.readFullBox(),n=t.readUint(4);let s,r;i&1&&(s=t.readInt(4)),i&4&&(r=t.readUint(4));const a=t.readEntries(n,()=>{const o={};return i&256&&(o.sampleDuration=t.readUint(4)),i&512&&(o.sampleSize=t.readUint(4)),i&1024&&(o.sampleFlags=t.readUint(4)),i&2048&&(o.sampleCompositionTimeOffset=e===1?t.readInt(4):t.readUint(4)),o});return{type:"trun",version:e,flags:i,sampleCount:n,dataOffset:s,firstSampleFlags:r,samples:a}}const Nn={avc1:se,avc3:se,hvc1:Sn,hev1:xn,mp4a:Rn,stsd:In,mdhd:En,hdlr:kn,tkhd:Ln,trex:_n},Bn={mfhd:Mn,tfhd:Cn,tfdt:On,trun:zn,mdat:Tn};function L(t,e){for(const i of t){if(e(i))return i;const n=i.boxes;if(n&&Array.isArray(n)){const s=L(n,e);if(s)return s}}}function _e(t){const e=new ArrayBuffer(t.byteLength);return new Uint8Array(e).set(t),e}function P(t){return e=>e.type===t}function At(t){const e=Le(_e(t),{readers:Nn}),i=L(e,P("mdhd"));if(!i)throw new Error("No mdhd box found in init segment");const s=L(e,P("tkhd"))?.trackId??1,r=L(e,P("hdlr"));if(!r)throw new Error("No hdlr box found in init segment");const a=r.handlerType==="soun"?"audio":r.handlerType==="vide"?"video":void 0;if(!a)throw new Error(`Unsupported track handler: ${r.handlerType}`);const o=L(e,P("stsd"));if(!o?.entries||o.entries.length===0)throw new Error("No stsd box found in init segment");const c=o.entries[0],l=jn(c),h=L(e,d=>d.type==="trex"&&d.trackId===s);return{description:l,timescale:i.timescale,trackId:s,kind:a,defaultSampleDuration:h?.defaultSampleDuration??0,defaultSampleSize:h?.defaultSampleSize??0,defaultSampleFlags:h?.defaultSampleFlags??0}}function jn(t){if(!(!t.boxes||!Array.isArray(t.boxes)))for(const e of t.boxes){if(e instanceof Uint8Array){if(e.length>8){const n=String.fromCharCode(e[4],e[5],e[6],e[7]);if(n==="avcC"||n==="hvcC"||n==="dOps")return new Uint8Array(e.slice(8));if(n==="esds")return re(new Uint8Array(e.slice(8)))}continue}const i=e.type;if(i==="avcC"||i==="hvcC"||i==="dOps"){if(e.view){const n=e.view,s=8,r=n.byteOffset+s,a=e.size-s;return new Uint8Array(n.buffer,r,a)}if(e.data instanceof Uint8Array)return new Uint8Array(e.data);if(e.raw instanceof Uint8Array)return new Uint8Array(e.raw.slice(8))}if(i==="esds"){let n;if(e.view){const s=e.view,r=8;n=new Uint8Array(s.buffer,s.byteOffset+r,e.size-r)}else e.data instanceof Uint8Array?n=new Uint8Array(e.data):e.raw instanceof Uint8Array&&(n=new Uint8Array(e.raw.slice(8)));if(n)return re(n)}}}function re(t){let e=4;for(;e<t.length;){const i=t[e++];let n=0;for(let s=0;s<4&&e<t.length;s++){const r=t[e++];if(n=n<<7|r&127,(r&128)===0)break}if(i===5)return e+n<=t.length?new Uint8Array(t.buffer,t.byteOffset+e,n):void 0;i===3?e+=3:i===4?e+=13:e+=n}}function Dn(t,e){const i=Le(_e(t),{readers:Bn}),s=L(i,P("tfdt"))?.baseMediaDecodeTime??0,r=L(i,P("tfhd")),a=r?.defaultSampleDuration??e.defaultSampleDuration,o=r?.defaultSampleSize??e.defaultSampleSize,c=r?.defaultSampleFlags??e.defaultSampleFlags,l=L(i,P("trun"));if(!l)throw new Error("No trun box found in data segment");const h=L(i,P("mdat"));if(!h)throw new Error("No mdat box found in data segment");const d=h.data;if(!d)throw new Error("No data in mdat box");const p=[];let g=0,v=s;for(let y=0;y<l.sampleCount;y++){const A=l.samples[y]??{},S=A.sampleSize??o,G=A.sampleDuration??a;if(S<=0)throw new Error(`Invalid sample size ${S} for sample ${y} in trun`);if(G<0)throw new Error(`Invalid sample duration ${G} for sample ${y} in trun`);if(g+S>d.length)throw new Error(`Sample ${y} would overflow mdat: offset=${g}, size=${S}, mdatLength=${d.length}`);const $t=y===0&&l.firstSampleFlags!==void 0?l.firstSampleFlags:A.sampleFlags??c,oi=A.sampleCompositionTimeOffset??0,ci=new Uint8Array(d.slice(g,g+S));g+=S;const li=v+oi,hi=Math.round(li*1e6/e.timescale),di=Math.round(G*1e6/e.timescale),ui=e.kind==="video"&&($t===0||($t&65536)===0);p.push({data:ci,timestamp:hi,keyframe:ui,duration:di}),v+=G}return p}class ze{#t;constructor(e){this.#t=e}decode(e){return Dn(e,this.#t).map(i=>({payload:i.data,timestamp:i.timestamp,keyframe:i.keyframe,duration:i.duration}))}}const Fn=W.fromMilli(1);function Lt(t,e){return t!==void 0&&e!==void 0&&e<=W.add(t,Fn)}function Un(t,e){return e===void 0?!1:e.consumer.sequence===t.consumer.sequence+1||Lt(t.end,e.frames.at(0)?.timestamp)}class pt{#t;#e;#n;#i=[];#s;#r;#a;#o=!1;#c;#h=0;#d;#l;#m=new u([]);buffered=this.#m;#u=new T;#y=new xi;constructor(e,i){this.#t=e,this.#e=i.format,this.#n=b(i.maxAge??f.zero),this.#u.spawn(this.#g.bind(this)),this.#u.cleanup(()=>{this.#t.close();for(const n of this.#i)n.consumer.close();this.#i.length=0})}#f(e){this.#y.peek()===void 0&&this.#y.set(e),this.#l?.(),this.#l=void 0}async#g(){try{for(;;){const e=await this.#t.recvGroup();if(!e)break;this.#s===void 0&&(this.#s=e.sequence);const i={consumer:e,frames:[],empty:!0,media:!1};this.#i.push(i),this.#i.sort((n,s)=>n.consumer.sequence-s.consumer.sequence),this.#u.spawn(this.#A.bind(this,i))}this.#f(null)}catch(e){this.#f(e instanceof Error?e:new Error(String(e)))}}async#A(e){try{let i=0;for(;;){const n=await e.consumer.readFrame();if(!n)break;e.empty=!1;const s=this.#e.decode(n.payload);for(const r of s){const a=this.#e.end?.(r)!==void 0,o={payload:r.payload,timestamp:r.timestamp,keyframe:!a&&i===0?!0:r.keyframe,duration:r.duration};a||(i++,e.media=!0,(e.minMedia===void 0||o.timestamp<e.minMedia)&&(e.minMedia=o.timestamp)),e.start??=o.timestamp,e.frames.push(o),(e.latest===void 0||o.timestamp>e.latest)&&(e.latest=o.timestamp);const c=o.timestamp+(o.duration??0);if((e.end===void 0||c>e.end)&&(e.end=c),this.#p(),!a&&this.#E(e,o.timestamp))return;let l=!1;e.consumer.sequence!==this.#s&&(this.#k(),l=this.#b()),(l||e.consumer.sequence===this.#s||e===this.#i[0])&&(this.#l?.(),this.#l=void 0)}}}catch(i){if(this.#d)return;if(e.truncated=!0,!(i instanceof J))throw i}finally{if(e.done=!0,e.consumer.sequence===this.#s){this.#w(e);const i=this.#i[this.#i.indexOf(e)+1];this.#s=Un(e,i)?i.consumer.sequence:e.consumer.sequence+1}this.#p(),this.#l?.(),this.#l=void 0,e.consumer.close()}}#w(e){e.end!==void 0&&(this.#r=e.end)}#v(e){return this.#a===void 0?!1:e===this.#a||!this.#o}#k(){if(this.#s===void 0)return;let e=0;const i=this.#i[0]?.consumer.sequence;let n=!1;for(;this.#i.length>=2;){const s=W.fromMilli(this.#n.peek()),r=this.#i[0];let a,o;for(const d of this.#i){if(d.latest===void 0)continue;const p=d.frames.at(0)?.timestamp??d.latest;(a===void 0||p<a)&&(a=p),(o===void 0||d.latest>o)&&(o=d.latest)}if(a===void 0||o===void 0||o-a<=s)break;this.#i.shift(),this.#s=this.#i[0]?.consumer.sequence;const l=this.#i[0]?.frames.at(0)?.timestamp??this.#i[0]?.end;(!r.empty&&!r.media||!Lt(r.end??this.#r,l))&&(n=!0),r.consumer.close(),r.frames.length=0,e++,this.#o=!0}n&&this.#x(),e&&(console.warn(`skipping slow groups: track=${this.#t.name} ${i} -> ${this.#s} count=${e}`),this.#p(),this.#l?.(),this.#l=void 0)}#b(){if(this.#s===void 0)return!1;const e=this.#i[0];if(!e||e.consumer.sequence!==this.#s||e.done||e.frames.length>0||e.end===void 0)return!1;const i=this.#i[1],n=i?.frames.at(0)?.timestamp;return!i||n===void 0||e.end<n?!1:(this.#i.shift(),console.warn(`skipping covered group: ${e.consumer.sequence} -> ${i.consumer.sequence}`),this.#w(e),this.#s=i.consumer.sequence,e.consumer.close(),e.frames.length=0,this.#p(),!0)}#T(){const e=this.#c;if(e!==void 0){for(const i of this.#i)if(!(i.consumer.sequence<=e.group)&&i.minMedia!==void 0&&i.minMedia<e.timestamp){this.#S(new Error("group timestamp is below the live edge"));return}}}#E(e,i){const n=this.#c;return n===void 0||e.consumer.sequence<=n.group||i>=n.timestamp?!1:(this.#S(new Error("group timestamp is below the live edge")),!0)}#S(e){this.#d=e,this.#f(e),this.#t.close(e),this.#l?.(),this.#l=void 0}async next(){for(;;){if(this.#d)throw this.#d;if(this.#T(),this.#d)throw this.#d;const e=this.#y.peek();if(this.#i.length===0&&e!==void 0){if(e instanceof Error)throw e;return}if(this.#s!==void 0&&this.#i.length>0){const s=this.#i[0];if(s.consumer.sequence>this.#s){const r=Lt(this.#r,s.frames.at(0)?.timestamp),a=s.empty&&s.consumer.done,o=W.fromMilli(this.#n.peek()),c=s.frames.length>0&&(o===0||this.#r!==void 0&&s.latest!==void 0&&s.latest-this.#r>o);(a||r||c||e!==void 0)&&((c||e!==void 0)&&!r&&!a&&this.#x(),r||(this.#o=!0),this.#s=s.consumer.sequence)}}if(this.#i.length>0&&this.#s!==void 0&&this.#i[0].consumer.sequence<=this.#s){const s=this.#i[0].frames.shift();if(s){const r=this.#i[0].consumer.sequence,a=this.#e.end?.(s);if(a!==void 0)return this.#i[0].media||this.#x(),(this.#c===void 0||a>this.#c.timestamp)&&(this.#c={group:r,timestamp:a}),this.#p(),{frame:void 0,group:r,discontinuity:this.#h,continuous:this.#v(r),end:a};const o=this.#v(r);r!==this.#a&&(this.#o=!1),this.#a=r;const c=this.#c;return(c===void 0||s.timestamp>c.timestamp)&&(this.#c={group:r,timestamp:s.timestamp}),this.#p(),{frame:s,group:r,discontinuity:this.#h,continuous:o}}if(this.#i[0].done){this.#i[0].consumer.sequence===this.#s&&(this.#w(this.#i[0]),this.#s+=1);const r=this.#i.shift();if(r){const a=r.consumer.sequence;return r.truncated&&(this.#o=!0),this.#p(),{frame:void 0,group:a,discontinuity:this.#h,continuous:this.#v(a)}}}if(this.#b())continue}if(this.#l)throw new Error("multiple calls to next not supported");const i=this.#u.abort;if(i.aborted)return;const n=await new Promise(s=>{const r=()=>s(!0);i.addEventListener("abort",r,{once:!0}),this.#l=()=>{i.removeEventListener("abort",r),s(!1)}});if(this.#l=void 0,n)return}}#x(){this.#h++,this.#a=void 0,this.#o=!0}#p(){const e=[];let i;for(const n of this.#i){const s=n.frames.at(0);if(!s||n.latest===void 0)continue;const r=f.fromMicro(s.timestamp),a=f.fromMicro(n.latest),o=e.at(-1),c=i?.done&&i.consumer.sequence+1===n.consumer.sequence;o&&(o.end>=r||c)?o.end=f.max(o.end,a):e.push({start:r,end:a}),i=n}this.#m.set(e)}get discontinuity(){return this.#h}close(){this.#f(null),this.#u.close()}}function mt(t,e){if(t.length===0)return e;if(e.length===0)return t;const i=[],n=[...t,...e].sort((s,r)=>s.start-r.start);for(const s of n){const r=i.at(-1);r&&r.end>=s.start?r.end=f.max(r.end,s.end):i.push({...s})}return i}const Pn=H([xe(["loc","cmaf","legacy","mediatimeline","eventtimeline"]),w()]),$n=H([xe(["video","audio","audiodescription","caption","subtitle","signlanguage"]),w()]),Wn={name:w(),packaging:Pn,isLive:m(at()),role:m($n),codec:m(w()),width:m(M()),height:m(M()),framerate:m(M()),samplerate:m(M()),channelConfig:m(w()),bitrate:m(M()),stalled:m(at()),initData:m(w()),renderGroup:m(M()),altGroup:m(M()),maxGrpSapStartingType:m(M()),maxObjSapStartingType:m(M()),jitter:m(M()),delay:m(M())},qn=["version","generatedAt","isComplete","tracks","initDataList"],Hn=x({id:w(),type:w(),data:w()}),Gn=x({...Wn,initRef:m(w())}),Vn=x({version:H([ut(1),w()]),tracks:m(Mt(Gn)),initDataList:m(Mt(Hn))});function Yn(t){const e=new TextDecoder().decode(t);try{const i=JSON.parse(e),n=Vn.parse(i),s=Object.create(null);for(const[o,c]of Object.entries(i))qn.includes(o)||(s[o]=c);const r=new Map((n.initDataList??[]).filter(o=>o.type==="inline").map(o=>[o.id,o.data])),a=(n.tracks??[]).map(({initRef:o,...c})=>(c.isLive??=!1,c.initData===void 0&&o!==void 0&&(c.initData=r.get(o)),c));return Object.keys(s).length>0?{tracks:a,ext:s}:{tracks:a}}catch(i){throw console.warn("invalid MSF catalog",e),i}}async function Kn(t){const e=await t.readFrame();if(e)return Yn(e.payload)}const la={BadSignature:1,BadTimestamp:2,BadSettingValue:3,BadFormat:4,UnknownSetting:5};class ha extends Error{code;line;constructor(e){super(e.reason),this.code=e.code,this.line=e.line}}const Jn=/\r?\n|\r/gm;async function Xn(t,e){const i=new ReadableStream({start(n){const s=t.split(Jn);for(const r of s)n.enqueue(r);n.close()}});return Zn(i,e)}async function Zn(t,e){const i=e?.type??"vtt";let n;if(typeof i=="string")switch(i){case"srt":n=(await It(async()=>{const{default:l}=await import("./srt-parser-BfIkQynj.js");return{default:l}},__vite__mapDeps([0,1,2,3,4]),import.meta.url)).default;break;case"ssa":case"ass":n=(await It(async()=>{const{default:l}=await import("./ssa-parser-eVcLy5ud.js");return{default:l}},__vite__mapDeps([5,2,3,1,4]),import.meta.url)).default;break;default:n=(await Promise.resolve().then(function(){return bs})).default}else n=i;let s;const r=t.getReader(),a=n(),o=!!e?.strict||!!e?.errors;await a.init({strict:!1,...e,errors:o,type:i,cancel(){r.cancel(),s=a.done(!0)}});let c=1;for(;;){const{value:l,done:h}=await r.read();if(h){a.parse("",c),s=a.done(!1);break}a.parse(l,c),c++}return s}const Qn=window.VTTCue;class Ne extends Qn{region=null;vertical="";snapToLines=!0;line="auto";lineAlign="start";position="auto";positionAlign="auto";size=100;align="center";style}class ts{id="";width=100;lines=3;regionAnchorX=0;regionAnchorY=100;viewportAnchorX=0;viewportAnchorY=100;scroll=""}const ae=",",es="%";function is(t){const e=parseInt(t,10);return Number.isNaN(e)?null:e}function nt(t){const e=parseInt(t.replace(es,""),10);return!Number.isNaN(e)&&e>=0&&e<=100?e:null}function oe(t){if(!t.includes(ae))return null;const[e,i]=t.split(ae).map(nt);return e!==null&&i!==null?[e,i]:null}function ns(t){const e=parseFloat(t);return Number.isNaN(e)?null:e}const ss="WEBVTT",ce=",",rs="%",Y=/[:=]/,as=/^[\s\t]*(region|vertical|line|position|size|align)[:=]/,os="NOTE",cs="REGION",ls=/^REGION:?[\s\t]+/,Z=/[\s\t]+/,hs="-->",ds=/[\s\t]*-->[\s\t]+/,us=/start|center|end|left|right/,fs=/start|center|end/,ps=/line-(?:left|right)|center|auto/,ms=/^(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;var Be=(t=>(t[t.None=0]="None",t[t.Header=1]="Header",t[t.Cue=2]="Cue",t[t.Region=3]="Region",t[t.Note=4]="Note",t))(Be||{});class je{f;c=0;g={};h={};j=[];a=null;b=null;k=[];d;l="";async init(e){this.f=e,e.strict&&(this.c=1),e.errors&&(this.d=(await It(async()=>{const{ParseErrorBuilder:i}=await import("./errors-9qZLU_Dk.js");return{ParseErrorBuilder:i}},__vite__mapDeps([6,1,2,3,4]),import.meta.url)).ParseErrorBuilder)}parse(e,i){if(e==="")this.a?(this.j.push(this.a),this.f.onCue?.(this.a),this.a=null):this.b?(this.h[this.b.id]=this.b,this.f.onRegion?.(this.b),this.b=null):this.c===1&&(this.i(e,i),this.f.onHeaderMetadata?.(this.g)),this.c=0;else if(this.c)switch(this.c){case 1:this.i(e,i);break;case 2:if(this.a){const n=this.a.text.length>0;!n&&as.test(e)?this.m(e.split(Z),i):this.a.text+=(n?`
`:"")+e}break;case 3:this.n(e.split(Z),i);break}else if(e.startsWith(os))this.c=4;else if(e.startsWith(cs))this.c=3,this.b=new ts,this.n(e.replace(ls,"").split(Z),i);else if(e.includes(hs)){const n=this.o(e,i);n&&(this.a=new Ne(n[0],n[1],""),this.a.id=this.l,this.m(n[2],i)),this.c=2}else i===1&&this.i(e,i);this.l=e}done(){return{metadata:this.g,cues:this.j,regions:Object.values(this.h),errors:this.k}}i(e,i){if(i>1){if(Y.test(e)){const[n,s]=e.split(Y);n&&(this.g[n]=(s||"").replace(Z,""))}}else e.startsWith(ss)?this.c=1:this.e(this.d?.p())}o(e,i){const[n,s=""]=e.split(ds),[r,...a]=s.split(Z),o=gt(n),c=gt(r);if(o!==null&&c!==null&&c>o)return[o,c,a];o===null&&this.e(this.d?.q(n,i)),c===null&&this.e(this.d?.r(r,i)),o!=null&&c!==null&&c>o&&this.e(this.d?.s(o,c,i))}n(e,i){let n;for(let s=0;s<e.length;s++)if(Y.test(e[s])){n=!1;const[r,a]=e[s].split(Y);switch(r){case"id":this.b.id=a;break;case"width":const o=nt(a);o!==null?this.b.width=o:n=!0;break;case"lines":const c=is(a);c!==null?this.b.lines=c:n=!0;break;case"regionanchor":const l=oe(a);l!==null?(this.b.regionAnchorX=l[0],this.b.regionAnchorY=l[1]):n=!0;break;case"viewportanchor":const h=oe(a);h!==null?(this.b.viewportAnchorX=h[0],this.b.viewportAnchorY=h[1]):n=!0;break;case"scroll":a==="up"?this.b.scroll="up":n=!0;break;default:this.e(this.d?.t(r,a,i))}n&&this.e(this.d?.u(r,a,i))}}m(e,i){let n;for(let s=0;s<e.length;s++)if(n=!1,Y.test(e[s])){const[r,a]=e[s].split(Y);switch(r){case"region":const o=this.h[a];o&&(this.a.region=o);break;case"vertical":a==="lr"||a==="rl"?(this.a.vertical=a,this.a.region=null):n=!0;break;case"line":const[c,l]=a.split(ce);if(c.includes(rs)){const v=nt(c);v!==null?(this.a.line=v,this.a.snapToLines=!1):n=!0}else{const v=ns(c);v!==null?this.a.line=v:n=!0}fs.test(l)?this.a.lineAlign=l:l&&(n=!0),this.a.line!=="auto"&&(this.a.region=null);break;case"position":const[h,d]=a.split(ce),p=nt(h);p!==null?this.a.position=p:n=!0,d&&ps.test(d)?this.a.positionAlign=d:d&&(n=!0);break;case"size":const g=nt(a);g!==null?(this.a.size=g,g<100&&(this.a.region=null)):n=!0;break;case"align":us.test(a)?this.a.align=a:n=!0;break;default:this.e(this.d?.v(r,a,i))}n&&this.e(this.d?.w(r,a,i))}}e(e){if(e){if(this.k.push(e),this.f.strict)throw this.f.cancel(),e;this.f.onError?.(e)}}}function gt(t){const e=t.match(ms);if(!e)return null;const i=e[1]?parseInt(e[1],10):0,n=parseInt(e[2],10),s=parseInt(e[3],10),r=e[4]?parseInt(e[4].padEnd(3,"0"),10):0,a=i*3600+n*60+s+r/1e3;return i<0||n<0||s<0||r<0||n>59||s>59?null:a}function gs(){return new je}var bs=Object.freeze({__proto__:null,VTTBlock:Be,VTTParser:je,default:gs,parseVTTTimestamp:gt});const ys=/[0-9]/,ws=/[\s\t]+/,De={c:"span",i:"i",b:"b",u:"u",ruby:"ruby",rt:"rt",v:"span",lang:"span",timestamp:"span"},vs={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&nbsp;":" ","&lrm;":"‎","&rlm;":"‏"},As=/&(?:amp|lt|gt|quot|#(0+)?39|nbsp|lrm|rlm);/g,ks=new Set(["white","lime","cyan","red","yellow","magenta","blue","black"]),xs=new Set(Object.keys(De));function Ss(t){let e="",i=1,n=[],s=[],r;for(let l=0;l<t.text.length;l++){const h=t.text[l];switch(i){case 1:h==="<"?(c(),i=2):e+=h;break;case 2:switch(h){case`
`:case"	":case" ":a(),i=4;break;case".":a(),i=3;break;case"/":i=5;break;case">":a(),i=1;break;default:!e&&ys.test(h)&&(i=6),e+=h;break}break;case 3:switch(h){case"	":case" ":case`
`:o(),r&&r.class?.trim(),i=4;break;case".":o();break;case">":o(),r&&r.class?.trim(),i=1;break;default:e+=h}break;case 4:h===">"?(e=e.replace(ws," "),r?.type==="v"?r.voice=St(e):r?.type==="lang"&&(r.lang=St(e)),e="",i=1):e+=h;break;case 5:h===">"&&(e="",r=s.pop(),i=1);break;case 6:if(h===">"){const d=gt(e);d!==null&&d>=t.startTime&&d<=t.endTime&&(e="timestamp",a(),r.time=d),e="",i=1}else e+=h;break}}function a(){if(xs.has(e)){const l=r;r=Ts(e),l?(s[s.length-1]!==l&&s.push(l),l.children.push(r)):n.push(r)}e="",i=1}function o(){if(r&&e){const l=e.replace("bg_","");ks.has(l)?r[e.startsWith("bg_")?"bgColor":"color"]=l:r.class=r.class?r.class+" "+e:e}e=""}function c(){if(!e)return;const l={type:"text",data:St(e)};r?r.children.push(l):n.push(l),e=""}return i===1&&c(),n}function Ts(t){return{tagName:De[t],type:t,children:[]}}function St(t){return t.replace(As,e=>vs[e]||"'")}function E(t,e,i){t.style.setProperty(`--${e}`,i+"")}function F(t,e,i=!0){t.setAttribute(`data-${e}`,i===!0?"":i+"")}function dt(t,e){t.setAttribute("part",e)}function Es(t){return parseFloat(getComputedStyle(t).lineHeight)||0}function Ms(t,e=0){return Fe(Ss(t),e)}function Fe(t,e=0){let i,n="";for(const s of t)if(s.type==="text")n+=s.data;else{const r=s.type==="timestamp";i={},i.class=s.class,i.title=s.type==="v"&&s.voice,i.lang=s.type==="lang"&&s.lang,i.part=s.type==="v"&&"voice",r&&(i.part="timed",i["data-time"]=s.time,i["data-future"]=s.time>e,i["data-past"]=s.time<e),i.style=`${s.color?`color: ${s.color};`:""}${s.bgColor?`background-color: ${s.bgColor};`:""}`;const a=Object.entries(i).filter(o=>o[1]).map(o=>`${o[0]}="${o[1]===!0?"":o[1]}"`).join(" ");n+=`<${s.tagName}${a?" "+a:""}>${Fe(s.children)}</${s.tagName}>`}return n}function Rs(t,e){for(const i of t.querySelectorAll('[part="timed"]')){const n=Number(i.getAttribute("data-time"));Number.isNaN(n)||(n>e?F(i,"future"):i.removeAttribute("data-future"),n<e?F(i,"past"):i.removeAttribute("data-past"))}}function Is(t,e){let i=null,n;function s(){r(),t(...n),n=void 0}function r(){clearTimeout(i),i=null}function a(){n=[].slice.call(arguments),r(),i=setTimeout(s,e)}return a}const $=Symbol(0);function Ft(t){return t instanceof HTMLElement?{top:t.offsetTop,width:t.clientWidth,height:t.clientHeight,left:t.offsetLeft,right:t.offsetLeft+t.clientWidth,bottom:t.offsetTop+t.clientHeight}:{...t}}function ft(t,e,i){switch(e){case"+x":t.left+=i,t.right+=i;break;case"-x":t.left-=i,t.right-=i;break;case"+y":t.top+=i,t.bottom+=i;break;case"-y":t.top-=i,t.bottom-=i;break}}function Os(t,e){return t.left<=e.right&&t.right>=e.left&&t.top<=e.bottom&&t.bottom>=e.top}function Cs(t,e){for(let i=0;i<e.length;i++)if(Os(t,e[i]))return e[i];return null}function le(t,e){return e.top>=0&&e.bottom<=t.height&&e.left>=0&&e.right<=t.width}function Ls(t,e,i){switch(i){case"+x":return e.left<0;case"-x":return e.right>t.width;case"+y":return e.top<0;case"-y":return e.bottom>t.height}}function _s(t,e){const i=Math.max(0,Math.min(t.width,e.right)-Math.max(0,e.left)),n=Math.max(0,Math.min(t.height,e.bottom)-Math.max(0,e.top));return i*n/(t.height*t.width)}function Ut(t,e){return{top:e.top/t.height,left:e.left/t.width,right:(t.width-e.right)/t.width,bottom:(t.height-e.bottom)/t.height}}function Ue(t,e){return e.top=e.top*t.height,e.left=e.left*t.width,e.right=t.width-e.right*t.width,e.bottom=t.height-e.bottom*t.height,e}const Pe=["top","left","right","bottom"];function $e(t,e,i,n){const s=Ut(e,i);for(const r of Pe)E(t,`${n}-${r}`,s[r]*100+"%")}function We(t,e,i,n){let s=1,r,a={...e};for(let o=0;o<n.length;o++){for(;Ls(t,e,n[o])||le(t,e)&&Cs(e,i);)ft(e,n[o],1);if(le(t,e))return e;const c=_s(t,e);s>c&&(r={...e},s=c),e={...a}}return r||a}const rt=Symbol(0);function zs(t,e,i,n){let s=i.firstElementChild,r=js(e),a,o=[];if(i[$]||(i[$]=Ns(t,i)),a=Ue(t,{...i[$]}),i[rt])o=[i[rt]==="top"?"+y":"-y","+x","-x"];else if(e.snapToLines){let c;switch(e.vertical){case"":o=["+y","-y"],c="height";break;case"rl":o=["+x","-x"],c="width";break;case"lr":o=["-x","+x"],c="width";break}let l=Es(s),h=l*Math.round(r),d=t[c]+l,p=o[0];Math.abs(h)>d&&(h=h<0?-1:1,h*=Math.ceil(d/l)*l),r<0&&(h+=e.vertical===""?t.height:t.width,o=o.reverse()),ft(a,p,h)}else{const c=e.vertical==="",l=c?"+y":"+x",h=c?a.height:a.width;ft(a,l,(c?t.height:t.width)*r/100),ft(a,l,e.lineAlign==="center"?h/2:e.lineAlign==="end"?h:0),o=c?["-y","+y","-x","+x"]:["-x","+x","-y","+y"]}return a=We(t,a,n,o),$e(i,t,a,"cue"),a}function Ns(t,e){const i=Ft(e),n=Bs(e);if(e[rt]=!1,n.top&&(i.top=n.top,i.bottom=n.top+i.height,e[rt]="top"),n.bottom){const s=t.height-n.bottom;i.top=s-i.height,i.bottom=s,e[rt]="bottom"}return n.left&&(i.left=n.left),n.right&&(i.right=t.width-n.right),Ut(t,i)}function Bs(t){const e={};for(const i of Pe)e[i]=parseFloat(t.style.getPropertyValue(`--cue-${i}`));return e}function js(t){return t.line==="auto"?t.snapToLines?-1:100:t.line}function Ds(t){if(t.position==="auto")switch(t.align){case"start":case"left":return 0;case"right":case"end":return 100;default:return 50}return t.position}function Fs(t,e){if(t.positionAlign==="auto")switch(t.align){case"start":return e==="ltr"?"line-left":"line-right";case"end":return e==="ltr"?"line-right":"line-left";case"center":return"center";default:return`line-${t.align}`}return t.positionAlign}const Us=["-y","+y","-x","+x"];function Ps(t,e,i,n){let s=Array.from(i.querySelectorAll('[part="cue-display"]')),r=0,a=Math.max(0,s.length-e.lines);for(let c=s.length-1;c>=a;c--)r+=s[c].offsetHeight;E(i,"region-height",r+"px"),i[$]||(i[$]=Ut(t,Ft(i)));let o={...i[$]};return o=Ue(t,o),o.width=i.clientWidth,o.height=r,o.right=o.left+o.width,o.bottom=o.top+r,o=We(t,o,n,Us),$e(i,t,o,"region"),o}class $s{overlay;z;A=0;C="ltr";B=[];D=!1;E;h=new Map;j=new Map;get dir(){return this.C}set dir(e){this.C=e,F(this.overlay,"dir",e)}get currentTime(){return this.A}set currentTime(e){this.A=e,this.update()}constructor(e,i){this.overlay=e,this.dir=i?.dir??"ltr",e.setAttribute("translate","yes"),e.setAttribute("aria-live","off"),e.setAttribute("aria-atomic","true"),dt(e,"captions"),this.G(),this.E=new ResizeObserver(this.I.bind(this)),this.E.observe(e)}changeTrack({regions:e,cues:i}){this.reset(),this.J(e);for(const n of i)this.j.set(n,null);this.update()}addCue(e){this.j.set(e,null),this.update()}removeCue(e){this.j.delete(e),this.update()}update(e=!1){this.H(e)}reset(){this.j.clear(),this.h.clear(),this.B=[],this.overlay.textContent=""}destroy(){this.reset(),this.E.disconnect()}I(){this.D=!0,this.K()}K=Is(()=>{this.D=!1,this.G();for(const e of this.h.values())e[$]=null;for(const e of this.j.values())e&&(e[$]=null);this.H(!0)},50);G(){this.z=Ft(this.overlay),E(this.overlay,"overlay-width",this.z.width+"px"),E(this.overlay,"overlay-height",this.z.height+"px")}H(e=!1){if(!this.j.size||this.D)return;let i,n=[...this.j.keys()].filter(r=>this.A>=r.startTime&&this.A<=r.endTime).sort((r,a)=>r.startTime!==a.startTime?r.startTime-a.startTime:r.endTime-a.endTime),s=n.map(r=>r.region);for(let r=0;r<this.B.length;r++){if(i=this.B[r],n[r]===i)continue;if(i.region&&!s.includes(i.region)){const o=this.h.get(i.region.id);o&&(o.removeAttribute("data-active"),e=!0)}const a=this.j.get(i);a&&(a.remove(),e=!0)}for(let r=0;r<n.length;r++){i=n[r];let a=this.j.get(i);a||this.j.set(i,a=this.L(i));const o=this.F(i)&&this.h.get(i.region.id);o&&!o.hasAttribute("data-active")&&(requestAnimationFrame(()=>F(o,"active")),e=!0),a.isConnected||((o||this.overlay).append(a),e=!0)}if(e){const r=[],a=new Set;for(let o=n.length-1;o>=0;o--){if(i=n[o],a.has(i.region||i))continue;const c=this.F(i),l=c?this.h.get(i.region.id):this.j.get(i);c?r.push(Ps(this.z,i.region,l,r)):r.push(zs(this.z,i,l,r)),a.add(c?i.region:i)}}Rs(this.overlay,this.A),this.B=n}J(e){if(e)for(const i of e){const n=this.M(i);this.h.set(i.id,n),this.overlay.append(n)}}M(e){const i=document.createElement("div");return dt(i,"region"),F(i,"id",e.id),F(i,"scroll",e.scroll),E(i,"region-width",e.width+"%"),E(i,"region-anchor-x",e.regionAnchorX),E(i,"region-anchor-y",e.regionAnchorY),E(i,"region-viewport-anchor-x",e.viewportAnchorX),E(i,"region-viewport-anchor-y",e.viewportAnchorY),E(i,"region-lines",e.lines),i}L(e){const i=document.createElement("div"),n=Ds(e),s=Fs(e,this.C);if(dt(i,"cue-display"),e.vertical!==""&&F(i,"vertical"),E(i,"cue-text-align",e.align),e.style)for(const a of Object.keys(e.style))i.style.setProperty(a,e.style[a]);if(this.F(e))E(i,"cue-offset",`${n-(s==="line-right"?100:s==="center"?50:0)}%`);else if(E(i,"cue-writing-mode",e.vertical===""?"horizontal-tb":e.vertical==="lr"?"vertical-lr":"vertical-rl"),!e.style?.["--cue-width"]){let a=n;s==="line-left"?a=100-n:s==="center"&&n<=50?a=n*2:s==="center"&&n>50&&(a=(100-n)*2);const o=e.size<a?e.size:a;e.vertical===""?E(i,"cue-width",o+"%"):E(i,"cue-height",o+"%")}const r=document.createElement("div");return dt(r,"cue"),e.id&&F(r,"id",e.id),r.innerHTML=Ms(e),i.append(r),i}F(e){return e.region&&e.size===100&&e.vertical===""&&e.line==="auto"}}function lt(t){let e=atob(t),i=new Uint8Array(e.length);for(let n=0;n<e.length;n++)i[n]=e.charCodeAt(n);return i}function Pt(t,e){if(t.get(e.broadcast.closed)!==void 0)return;let i=e.broadcast.track(e.track).subscribe({priority:e.priority,maxAge:e.maxAge.peek()});return t.cleanup(()=>i.close()),t.run(n=>{i.update({priority:e.priority,maxAge:n.get(e.maxAge)})}),i}async function bt(t){try{return await t.next()}catch(e){if(!(e instanceof J))throw e;console.debug("media subscription ended",e);return}}var O=0,Q=1,D=2,tt=3,Ws=4,qs=4294967295n;function j(t,e){return BigInt(t>>>0)<<32n|BigInt(e>>>0)}function z(t){return Number(t>>32n)|0}function Hs(t){return!!(z(t)&1)}function C(t){return Number(t&qs)|0}function Gs(t){return t<=1?1:1<<32-Math.clz32(t-1)}function qe(t,e,i,n=!1){if(t<=0)throw Error("invalid channels");if(e<=0||e>2**30)throw Error("invalid capacity");if(i<=0)throw Error("invalid sample rate");e=Gs(e);let s=new SharedArrayBuffer(t*e*Float32Array.BYTES_PER_ELEMENT),r=new SharedArrayBuffer(Ws*Int32Array.BYTES_PER_ELEMENT),a=new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT),o=new Int32Array(r);return Atomics.store(o,D,1),{channels:t,capacity:e,rate:i,samples:s,control:r,state:a,buffered:n}}function he(t,e){return(t-e|0)>0?t:e}function et(t,e){return t&e-1}var Vs=class He{channels;capacity;rate;buffered;init;#t;#e;#n;#i=!1;#s=0;#r=0;#a=0;constructor(e,i){this.channels=e.channels,this.capacity=e.capacity,this.rate=e.rate,this.buffered=e.buffered,this.init=e,this.#t=new Int32Array(e.control),this.#e=new BigInt64Array(e.state),this.#n=[];for(let n=0;n<this.channels;n++)this.#n.push(new Float32Array(e.samples,n*this.capacity*Float32Array.BYTES_PER_ELEMENT,this.capacity));i!==void 0&&this.#o(i)}#o(e){if(e.channels!==this.channels||e.rate!==this.rate)return;let i=Atomics.load(e.#t,tt),n=Atomics.load(e.#e,0);for(;;){let s=Atomics.load(this.#e,0);if(Atomics.load(this.#t,tt)!==i||(C(n)-C(s)|0)<=0)return;let r=j(z(s),C(n));if(Atomics.compareExchange(this.#e,0,s,r)===s)return}}#c(e){for(;;){let i=Atomics.load(this.#e,0);if((e-C(i)|0)<=0)return;let n=j(z(i),e);if(Atomics.compareExchange(this.#e,0,i,n)===i)return}}#h(e){for(;;){let i=Atomics.load(this.#e,0),n=j(z(i)+e|0,C(i));if(Atomics.compareExchange(this.#e,0,i,n)===i)return}}insert(e,i){if(i.length!==this.channels)throw Error("wrong number of channels");let n=Math.round(Rt.fromMicro(e)*this.rate),s=i[0].length,r=0;if(!this.#i){this.#s=n;let p=z(Atomics.load(this.#e,0));Atomics.add(this.#t,tt,1),Atomics.store(this.#e,0,j(p+2|0,0)),Atomics.store(this.#t,O,0),this.#i=!0,this.#r=0,this.#a=0}n=n-this.#s|0;let a=n+s|0,o=C(Atomics.load(this.#e,0)),c=o-n|0;if(c>0){if(c>=s)return;r=c,n=n+c|0}let l=s-r;(a-o|0)>this.capacity&&this.#c(a-this.capacity|0);let h=Atomics.load(this.#t,O),d=n-h|0;if(d>0){let p=Math.min(d,this.capacity);for(let g=0;g<this.channels;g++){let v=this.#n[g];for(let y=0;y<p;y++)v[et(h+y|0,this.capacity)]=0}}for(let p=0;p<this.channels;p++){let g=i[p],v=this.#n[p];for(let y=0;y<l;y++)v[et(n+y|0,this.capacity)]=g[r+y]}Atomics.store(this.#t,O,he(Atomics.load(this.#t,O),a)),this.#d()}#d(){let e=C(Atomics.load(this.#e,0)),i=Atomics.load(this.#t,O),n=Atomics.load(this.#t,Q);(i-e|0)>=n&&n>0&&Atomics.store(this.#t,D,0)}read(e){let i=Atomics.load(this.#e,0);if(Atomics.load(this.#t,D)===1||Hs(i))return 0;let n=C(i),s=Atomics.load(this.#t,O),r=Atomics.load(this.#t,Q),a=s-n|0;if(!this.buffered&&r>0&&a>r){let h=s-r|0;(h-n|0)>0&&(n=h)}let o=s-n|0,c=Math.min(o,e[0].length);if(c<=0)return(n-C(i)|0)>0&&Atomics.compareExchange(this.#e,0,i,j(z(i),n)),0;for(let h=0;h<this.channels;h++){let d=this.#n[h],p=e[h];for(let g=0;g<c;g++)p[g]=d[et(n+g|0,this.capacity)]}let l=j(z(i),n+c|0);if(Atomics.compareExchange(this.#e,0,i,l)!==i){for(let h=0;h<this.channels;h++)e[h].fill(0,0,c);return 0}return c}setLatency(e){let i=Atomics.exchange(this.#t,Q,e);i>0&&e>i&&(Atomics.store(this.#t,D,1),this.#h(2)),this.#d()}truncate(e){let i=Math.round(Rt.fromMicro(e)*this.rate)-this.#s|0;if(!((Atomics.load(this.#t,O)-i|0)<=0)){for(this.#h(1);;){let n=Atomics.load(this.#t,O),s=he(i,C(Atomics.load(this.#e,0)));if((n-s|0)<=0||Atomics.compareExchange(this.#t,O,n,s)===n)break}this.#h(1)}}reset(){this.#i=!1,Atomics.store(this.#t,D,1);let e=Atomics.load(this.#t,O),i=Atomics.load(this.#e,0);Atomics.store(this.#e,0,j(z(i),e))}resize(e){let i=qe(this.channels,e,this.rate,this.buffered),n=new He(i);n.#i=this.#i,n.#s=this.#s;let s=Atomics.load(this.#e,0),r=C(s),a=Atomics.load(this.#t,O),o=Atomics.load(this.#t,Q),c=Atomics.load(this.#t,D),l=a-r|0,h=Math.max(0,Math.min(l,n.capacity)),d=a-h|0;for(let p=0;p<this.channels;p++){let g=this.#n[p],v=n.#n[p];for(let y=0;y<h;y++){let A=d+y|0;v[et(A,n.capacity)]=g[et(A,this.capacity)]}}return Atomics.store(n.#t,tt,Atomics.load(this.#t,tt)),Atomics.store(n.#e,0,j(z(s),d)),Atomics.store(n.#t,O,a),Atomics.store(n.#t,Q,o),Atomics.store(n.#t,D,c),n.#r=this.#l(r)+(d-r|0),n.#a=d,n}#l(e){return this.#r+=e-this.#a|0,this.#a=e,this.#r}#m(){return this.#l(C(Atomics.load(this.#e,0)))}get timestamp(){return W.fromSecond((this.#s+this.#m())/this.rate)}get anchored(){return this.#i}get stalled(){return Atomics.load(this.#t,D)===1}get length(){return Atomics.load(this.#t,O)-C(Atomics.load(this.#e,0))|0}},Ge=class{#t;#e;#n=[];#i;#s=!0;#r;#a;constructor(t,e){this.#t=t,this.#e=e}setHeadroom(t){this.#e=t}wait(t,e){return!this.#t||e.aborted||this.#c(t)?Promise.resolve():new Promise(i=>{let n=()=>{this.#n=this.#n.filter(r=>r!==s),i()},s={timestamp:t,resolve:()=>{e.removeEventListener("abort",n),i()}};e.addEventListener("abort",n,{once:!0}),this.#n.push(s)})}observe(t,e){this.#i=t,this.#s=e,e||(this.#r=void 0,this.#a=void 0),this.#o()}reset(){this.#i=void 0,this.#s=!0,this.#r=void 0,this.#a=void 0,this.#o()}close(){this.#t=!1;for(let{resolve:t}of this.#n)t();this.#n=[]}#o(){this.#n=this.#n.filter(({timestamp:t,resolve:e})=>!this.#c(t)||(e(),!1))}#c(t){let e=this.#i;if(!this.#s&&e!==void 0)return t-this.#e<=e;let i=this.#r,n=this.#a;if(i!==void 0&&n!==void 0){let s=e??i;if(t-this.#e>s&&n-this.#e>=s)return!1}return this.#r??=t,this.#a=n===void 0?t:Math.max(n,t),!0}};function yt(t,e){return W.fromSecond(t/e)}function Ys(){return!(typeof SharedArrayBuffer>"u"||typeof crossOriginIsolated<"u"&&!crossOriginIsolated)}function Ks(t,e,i,n,s=!1){return Ys()?(console.log("[audio] using SharedArrayBuffer audio buffer"),new Js(t,e,i,n,s)):(console.warn("[audio] SharedArrayBuffer unavailable, falling back to the higher latency postMessage audio buffer. Serve the page cross-origin isolated (Cross-Origin-Opener-Policy: same-origin, Cross-Origin-Embedder-Policy: require-corp) to avoid this."),new Xs(t,e,i,n,s))}var Js=class{rate;channels;#t;#e;#n=new u(0);timestamp=this.#n;#i=new u(!0);stalled=this.#i;#s;#r=new T;constructor(t,e,i,n,s){this.#t=t,this.channels=e,this.rate=i;let r=Math.max(i,n*2);this.#s=new Ge(s,yt(n,i));let a=qe(e,r,i,s);this.#e=new Vs(a),this.#e.setLatency(n);let o={type:"init-shared",...a};t.port.postMessage(o),this.#r.interval(()=>{this.#n.set(this.#e.timestamp),this.#i.set(this.#e.stalled),this.#a()},50)}#a(){this.#s.observe(this.#e.anchored?this.#e.timestamp:void 0,this.#e.stalled)}insert(t,e){this.#e.insert(t,e)}setLatency(t){if(this.#s.setHeadroom(yt(t,this.rate)),this.#e.setLatency(t),this.#e.capacity<t*1.5){let e=Math.max(this.rate,t*2);this.#e=this.#e.resize(e);let i={type:"init-shared",...this.#e.init};this.#t.port.postMessage(i)}}truncate(t){this.#e.truncate(t)}reset(){this.#e.reset(),this.#s.reset()}wait(t,e){return this.#a(),this.#s.wait(t,e)}close(){this.#s.close(),this.#r.close()}},Xs=class{rate;channels;#t;#e=new u(0);timestamp=this.#e;#n=new u(!0);stalled=this.#n;#i;#s=0;#r=new T;constructor(t,e,i,n,s){this.#t=t,this.channels=e,this.rate=i,this.#i=new Ge(s,yt(n,i));let r={type:"init-post",channels:e,rate:i,latency:f.fromSecond(n/i),buffered:s};t.port.postMessage(r),this.#r.event(t.port,"message",a=>{let o=a.data;o?.type==="state"&&(this.#e.set(o.timestamp),this.#n.set(o.stalled),o.epoch===this.#s&&this.#i.observe(o.anchored?o.timestamp:void 0,o.stalled))}),t.port.start()}insert(t,e){let i={type:"data",data:e,timestamp:t};this.#t.port.postMessage(i,e.map(n=>n.buffer))}setLatency(t){this.#i.setHeadroom(yt(t,this.rate));let e={type:"latency",latency:f.fromSecond(t/this.rate)};this.#t.port.postMessage(e)}truncate(t){let e={type:"truncate",timestamp:t};this.#t.port.postMessage(e)}reset(){this.#s++;let t={type:"reset",epoch:this.#s};this.#t.port.postMessage(t),this.#i.reset()}wait(t,e){return this.#i.wait(t,e)}close(){this.#i.close(),this.#r.close()}},Zs=128,Qs=20,tr=1024,er=1152,ir=576,nr=32e3;function Ve(t){return{codec:t.codec,container:t.container,description:t.description,sampleRate:t.sampleRate,numberOfChannels:t.numberOfChannels}}function sr(t){return{broadcast:t.broadcast,decoder:Ve(t)}}function rr(t){let e=(t.jitter||ar(t))??0,i=Math.ceil(Zs/t.sampleRate*1e3);return f((t.delay??0)+e+i)}function ar(t){if(t.codec.startsWith("opus"))return Qs;if(t.codec.startsWith("mp4a"))return Math.ceil(tr/t.sampleRate*1e3);if(t.codec==="mp3"){let e=t.sampleRate>=nr?er:ir;return Math.ceil(e/t.sampleRate*1e3)}}var or=class{#t=!1;#e=!1;opened(){this.#t&&(this.#e=!0),this.#t=!0}takeover(){let t=this.#e;return this.#e=!1,t}},cr=128;function de(t,e){return Math.max(cr,Math.ceil(t*Rt.fromMilli(e)))}var ue=class{#t;#e=[];#n;#i;#s;constructor(t){this.#t=t}push(t){let e=this.#t?.();if(!e)return[t];let{group:i,frame:n}=t;if(this.#n??={group:i,timestamp:n.timestamp},i>this.#n.group)return[...this.flush(),t];this.#e.push(t);let s=Math.min(this.#i?.oldest??n.timestamp,n.timestamp),r=Math.max(this.#i?.newest??n.timestamp,n.timestamp);return this.#i={oldest:s,newest:r},i===this.#n.group&&n.timestamp-this.#n.timestamp>e.floor||r-s>=e.maxDelay?this.flush():[]}flush(){this.#t=void 0;let t=this.#e;return this.#e=[],t.sort((e,i)=>e.frame.timestamp-i.frame.timestamp)}admit(t){let{timestamp:e}=t.frame;return this.#s!==void 0&&e<this.#s?!1:(this.#s=e,!0)}reset(){this.#s=void 0}},lr=new Blob([`Object.assign((value) => value, {
	zero: 0,
	fromMicro: (us) => us * 1e3,
	fromMilli: (ms) => ms * 1e6,
	fromSecond: (s) => s * 1e9,
	toMicro: (ns) => ns / 1e3,
	toMilli: (ns) => ns / 1e6,
	toSecond: (ns) => ns / 1e9,
	now: () => performance.now() * 1e6,
	add: (a, b) => a + b,
	sub: (a, b) => a - b,
	mul: (a, b) => a * b,
	div: (a, b) => a / b,
	max: (a, b) => Math.max(a, b),
	min: (a, b) => Math.min(a, b)
});
/** Constructors, conversions, and arithmetic for {@link Micro} values. */
const Micro = Object.assign((value) => value, {
	zero: 0,
	fromNano: (ns) => ns / 1e3,
	fromMilli: (ms) => ms * 1e3,
	fromSecond: (s) => s * 1e6,
	toNano: (us) => us * 1e3,
	toMilli: (us) => us / 1e3,
	toSecond: (us) => us / 1e6,
	now: () => performance.now() * 1e3,
	add: (a, b) => a + b,
	sub: (a, b) => a - b,
	mul: (a, b) => a * b,
	div: (a, b) => a / b,
	max: (a, b) => Math.max(a, b),
	min: (a, b) => Math.min(a, b)
});
Object.assign((value) => value, {
	zero: 0,
	fromNano: (ns) => ns / 1e6,
	fromMicro: (us) => us / 1e3,
	fromSecond: (s) => s * 1e3,
	toNano: (ms) => ms * 1e6,
	toMicro: (ms) => ms * 1e3,
	toSecond: (ms) => ms / 1e3,
	now: () => performance.now(),
	add: (a, b) => a + b,
	sub: (a, b) => a - b,
	mul: (a, b) => a * b,
	div: (a, b) => a / b,
	max: (a, b) => Math.max(a, b),
	min: (a, b) => Math.min(a, b)
});
Object.assign((unitsPerSecond) => {
	if (!Number.isSafeInteger(unitsPerSecond) || unitsPerSecond <= 0) throw new RangeError(\`invalid timescale: \${unitsPerSecond}\`);
	return unitsPerSecond;
}, {
	/** One unit per second. */
	SECOND: 1,
	/** 1,000 units per second. */
	MILLI: 1e3,
	/** 1,000,000 units per second. */
	MICRO: 1e6,
	/** 1,000,000,000 units per second. */
	NANO: 1e9
});
/** Constructors, conversions, and arithmetic for {@link Second} values. */
const Second = Object.assign((value) => value, {
	zero: 0,
	fromNano: (ns) => ns / 1e9,
	fromMicro: (us) => us / 1e6,
	fromMilli: (ms) => ms / 1e3,
	toNano: (s) => s * 1e9,
	toMicro: (s) => s * 1e6,
	toMilli: (s) => s * 1e3,
	now: () => performance.now() / 1e3,
	add: (a, b) => a + b,
	sub: (a, b) => a - b,
	mul: (a, b) => a * b,
	div: (a, b) => a / b,
	max: (a, b) => Math.max(a, b),
	min: (a, b) => Math.min(a, b)
});
//#endregion
//#region src/audio/ring-buffer.ts
var AudioRingBuffer = class {
	#buffer;
	#writeIndex = 0;
	#readIndex = 0;
	rate;
	channels;
	#stalled = true;
	#buffered;
	#latencySamples;
	#anchored = false;
	constructor(props) {
		if (props.channels <= 0) throw new Error("invalid channels");
		if (props.rate <= 0) throw new Error("invalid sample rate");
		if (props.latency <= 0) throw new Error("invalid latency");
		this.#latencySamples = Math.ceil(props.rate * Second.fromMilli(props.latency));
		if (this.#latencySamples === 0) throw new Error("empty buffer");
		this.rate = props.rate;
		this.channels = props.channels;
		this.#buffered = props.buffered ?? false;
		const capacity = this.#capacityFor(this.#latencySamples);
		this.#buffer = [];
		for (let i = 0; i < this.channels; i++) this.#buffer[i] = new Float32Array(capacity);
	}
	#capacityFor(latencySamples) {
		return this.#buffered ? latencySamples * 2 : latencySamples;
	}
	get stalled() {
		return this.#stalled;
	}
	get timestamp() {
		return Micro.fromSecond(this.#readIndex / this.rate);
	}
	/** Whether an insert has anchored the indices since creation or the last reset. */
	get anchored() {
		return this.#anchored;
	}
	get length() {
		return this.#writeIndex - this.#readIndex;
	}
	get capacity() {
		return this.#buffer[0]?.length;
	}
	resize(latency) {
		const latencySamples = Math.ceil(this.rate * Second.fromMilli(latency));
		if (latencySamples > this.#latencySamples) this.#stalled = true;
		this.#latencySamples = latencySamples;
		const newCapacity = this.#capacityFor(this.#latencySamples);
		if (newCapacity !== this.capacity) this.#reallocate(newCapacity);
		if (latencySamples > 0 && this.length >= latencySamples) this.#stalled = false;
	}
	#reallocate(newCapacity) {
		if (newCapacity === 0) throw new Error("empty buffer");
		const newBuffer = [];
		for (let i = 0; i < this.channels; i++) newBuffer[i] = new Float32Array(newCapacity);
		const samplesToKeep = Math.min(this.length, newCapacity);
		if (samplesToKeep > 0) {
			const copyStart = this.#writeIndex - samplesToKeep;
			for (let channel = 0; channel < this.channels; channel++) {
				const src = this.#buffer[channel];
				const dst = newBuffer[channel];
				for (let i = 0; i < samplesToKeep; i++) {
					const srcPos = (copyStart + i) % src.length;
					const dstPos = (copyStart + i) % dst.length;
					dst[dstPos] = src[srcPos];
				}
			}
		}
		this.#buffer = newBuffer;
		this.#readIndex = this.#writeIndex - samplesToKeep;
		if (samplesToKeep === 0) this.#stalled = true;
	}
	write(timestamp, data) {
		if (data.length !== this.channels) throw new Error("wrong number of channels");
		let start = Math.round(Second.fromMicro(timestamp) * this.rate);
		let samples = data[0].length;
		if (!this.#anchored) {
			this.#readIndex = start;
			this.#writeIndex = start;
			this.#anchored = true;
		}
		let offset = this.#readIndex - start;
		if (offset > samples) return;
		else if (offset > 0) {
			samples -= offset;
			start += offset;
		} else offset = 0;
		const end = start + samples;
		const overflow = end - this.#readIndex - this.#buffer[0].length;
		if (overflow >= 0) {
			this.#stalled = false;
			this.#readIndex += overflow;
		}
		if (start > this.#writeIndex) {
			const gapSize = Math.min(start - this.#writeIndex, this.#buffer[0].length);
			if (gapSize === 1) console.warn("floating point inaccuracy detected");
			for (let channel = 0; channel < this.channels; channel++) {
				const dst = this.#buffer[channel];
				for (let i = 0; i < gapSize; i++) {
					const writePos = (this.#writeIndex + i) % dst.length;
					dst[writePos] = 0;
				}
			}
		}
		for (let channel = 0; channel < this.channels; channel++) {
			let src = data[channel];
			src = src.subarray(src.length - samples);
			const dst = this.#buffer[channel];
			if (src.length !== samples) throw new Error("mismatching number of samples");
			for (let i = 0; i < samples; i++) {
				const writePos = (start + i) % dst.length;
				dst[writePos] = src[i];
			}
		}
		if (end > this.#writeIndex) this.#writeIndex = end;
		if (this.#buffered && this.length >= this.#latencySamples) this.#stalled = false;
	}
	/**
	* Drop buffered samples at or after \`timestamp\`, keeping whatever is already due.
	*
	* A successor track overwrites the slots its own samples land on, but anything the previous
	* track wrote beyond them would otherwise still play once the successor runs out.
	*/
	truncate(timestamp) {
		const target = Math.round(Second.fromMicro(timestamp) * this.rate);
		if (target >= this.#writeIndex) return;
		this.#writeIndex = Math.max(target, this.#readIndex);
	}
	reset() {
		this.#readIndex = 0;
		this.#writeIndex = 0;
		this.#stalled = true;
		this.#anchored = false;
	}
	read(output) {
		if (output.length !== this.channels) throw new Error("wrong number of channels");
		if (this.#stalled) return 0;
		const samples = Math.min(this.#writeIndex - this.#readIndex, output[0].length);
		if (samples === 0) return 0;
		for (let channel = 0; channel < this.channels; channel++) {
			const dst = output[channel];
			const src = this.#buffer[channel];
			if (dst.length !== output[0].length) throw new Error("mismatching number of samples");
			for (let i = 0; i < samples; i++) {
				const readPos = (this.#readIndex + i) % src.length;
				dst[i] = src[readPos];
			}
		}
		this.#readIndex += samples;
		return samples;
	}
};
//#endregion
//#region src/audio/shared-ring-buffer.ts
const WRITE = 0;
const LATENCY = 1;
const STALLED = 2;
const TIMELINE = 3;
const CONTROL_SLOTS = 4;
/**
* The playhead and its mutation epoch, packed into one 64-bit word: epoch in the high
* half, read cursor in the low half.
*
* They have to move together. The reader samples the ring, copies, and only then publishes, and
* the writer can rebase the timeline anywhere in between. Checking an epoch and then writing a
* cursor leaves a window between the two no ordering closes, which is how a stale cursor ends up
* on a fresh timeline: the playhead lands past WRITE, \`read\` returns nothing, and \`insert\` drops
* everything as too old until WRITE catches up. Packed, the check *is* the write: the reader
* compare-exchanges the whole word, so a rebase makes its publish fail rather than land.
*/
const CURSOR_MASK = 4294967295n;
function pack(epoch, read) {
	return BigInt(epoch >>> 0) << 32n | BigInt(read >>> 0);
}
/**
* The mutation epoch. Even while settled, odd while \`truncate\` retreats WRITE.
*
* WRITE lives in a different word, so a retreat cannot move it and the epoch together. Marking
* the epoch on either side of the retreat is what covers the gap: a reader that snapshotted
* before the mark finds the word moved and its exchange fails, one that snapshots between the
* marks sees the odd epoch and renders silence, and one that snapshots after already reads the
* retreated WRITE. So the writer steps by two on a re-anchor, keeping odd for the retreat alone.
*/
function epochOf(state) {
	return Number(state >> 32n) | 0;
}
/** Whether a \`truncate\` is mid-retreat, so WRITE may still describe samples it is dropping. */
function retreating(state) {
	return (epochOf(state) & 1) !== 0;
}
/** The playhead half, back as an i32 so the modular comparisons elsewhere still hold. */
function readOf(state) {
	return Number(state & CURSOR_MASK) | 0;
}
/** Rounds up to a power of two, which is what makes \`slot\` wrap-invariant. */
function ceilPow2(n) {
	return n <= 1 ? 1 : 1 << 32 - Math.clz32(n - 1);
}
/**
* Allocate the shared memory for a ring holding at least \`capacity\` samples per channel.
*
* The capacity is rounded up to a power of two so \`slot\` can mask instead of taking a
* remainder; read \`init.capacity\` back rather than assuming the requested value.
*/
function allocSharedRingBuffer(channels, capacity, rate, buffered = false) {
	if (channels <= 0) throw new Error("invalid channels");
	if (capacity <= 0 || capacity > 2 ** 30) throw new Error("invalid capacity");
	if (rate <= 0) throw new Error("invalid sample rate");
	capacity = ceilPow2(capacity);
	const samples = new SharedArrayBuffer(channels * capacity * Float32Array.BYTES_PER_ELEMENT);
	const control = new SharedArrayBuffer(CONTROL_SLOTS * Int32Array.BYTES_PER_ELEMENT);
	const state = new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT);
	const ctrl = new Int32Array(control);
	Atomics.store(ctrl, STALLED, 1);
	return {
		channels,
		capacity,
		rate,
		samples,
		control,
		state,
		buffered
	};
}
/** Modular i32 max: returns a if a is ahead of b, else b. */
function i32Max(a, b) {
	return (a - b | 0) > 0 ? a : b;
}
/**
* Maps a sample index to a [0, capacity) array slot.
*
* \`capacity\` is a power of two, so masking is exact for negative indexes and, unlike a
* remainder, survives the i32 wrap: consecutive indexes stay consecutive slots across
* 0x7fffffff -> 0x80000000, which is what keeps unread samples from aliasing there.
*/
function slot(idx, capacity) {
	return idx & capacity - 1;
}
var SharedRingBuffer = class SharedRingBuffer {
	channels;
	capacity;
	rate;
	buffered;
	init;
	#control;
	#state;
	#samples;
	#anchored = false;
	#anchor = 0;
	#position = 0;
	#lastRead = 0;
	/**
	* Wrap the shared memory described by \`init\`.
	*
	* Pass \`previous\` in the worklet when this ring replaces one already being read. \`resize\`
	* snapshots the playhead on the main thread and hands the replacement over by message, so the
	* reader keeps draining the old ring in the meantime. Carrying its cursor across means those
	* samples are not played twice.
	*/
	constructor(init, previous) {
		this.channels = init.channels;
		this.capacity = init.capacity;
		this.rate = init.rate;
		this.buffered = init.buffered;
		this.init = init;
		this.#control = new Int32Array(init.control);
		this.#state = new BigInt64Array(init.state);
		this.#samples = [];
		for (let i = 0; i < this.channels; i++) this.#samples.push(new Float32Array(init.samples, i * this.capacity * Float32Array.BYTES_PER_ELEMENT, this.capacity));
		if (previous !== void 0) this.#handoff(previous);
	}
	/**
	* Carry \`source\`'s playhead across, if the replacement is still the timeline it belongs to.
	*
	* Truncation changes the mutation epoch but preserves timeline identity. Sample state before
	* identity: a re-anchor publishes identity first, then replaces state. Either the identity
	* check rejects the old cursor, the exchange fails, or the re-anchor overwrites the carried
	* cursor. A truncate only forces a retry, preserving audio consumed since the resize.
	*/
	#handoff(source) {
		if (source.channels !== this.channels || source.rate !== this.rate) return;
		const timeline = Atomics.load(source.#control, TIMELINE);
		const from = Atomics.load(source.#state, 0);
		for (;;) {
			const state = Atomics.load(this.#state, 0);
			if (Atomics.load(this.#control, TIMELINE) !== timeline) return;
			if ((readOf(from) - readOf(state) | 0) <= 0) return;
			const next = pack(epochOf(state), readOf(from));
			if (Atomics.compareExchange(this.#state, 0, state, next) === state) return;
		}
	}
	/**
	* Move the playhead forward to \`candidate\`, staying on whatever timeline is current.
	*
	* Retries while the word changes under it, and never steps backwards. Used by the writer's
	* overflow path; the reader publishes with its own exchange so it can tell a rebase apart
	* from losing a race.
	*/
	#advance(candidate) {
		for (;;) {
			const state = Atomics.load(this.#state, 0);
			if ((candidate - readOf(state) | 0) <= 0) return;
			const next = pack(epochOf(state), candidate);
			if (Atomics.compareExchange(this.#state, 0, state, next) === state) return;
		}
	}
	/**
	* Step the epoch by \`by\`, leaving the playhead wherever the reader has taken it.
	*
	* Retries while the word changes under it: only the epoch half is the writer's to move.
	*/
	#step(by) {
		for (;;) {
			const state = Atomics.load(this.#state, 0);
			const next = pack(epochOf(state) + by | 0, readOf(state));
			if (Atomics.compareExchange(this.#state, 0, state, next) === state) return;
		}
	}
	/**
	* Insert audio samples at the given timestamp.
	* Main thread only. Handles out-of-order writes, gap filling, and overflow.
	*/
	insert(timestamp, data) {
		if (data.length !== this.channels) throw new Error("wrong number of channels");
		let start = Math.round(Second.fromMicro(timestamp) * this.rate);
		const originalLength = data[0].length;
		let offset = 0;
		if (!this.#anchored) {
			this.#anchor = start;
			const epoch = epochOf(Atomics.load(this.#state, 0));
			Atomics.add(this.#control, TIMELINE, 1);
			Atomics.store(this.#state, 0, pack(epoch + 2 | 0, 0));
			Atomics.store(this.#control, WRITE, 0);
			this.#anchored = true;
			this.#position = 0;
			this.#lastRead = 0;
		}
		start = start - this.#anchor | 0;
		const end = start + originalLength | 0;
		const read = readOf(Atomics.load(this.#state, 0));
		const behind = read - start | 0;
		if (behind > 0) {
			if (behind >= originalLength) return;
			offset = behind;
			start = start + behind | 0;
		}
		const samples = originalLength - offset;
		if ((end - read | 0) > this.capacity) this.#advance(end - this.capacity | 0);
		const write = Atomics.load(this.#control, WRITE);
		const gap = start - write | 0;
		if (gap > 0) {
			const gapSize = Math.min(gap, this.capacity);
			for (let channel = 0; channel < this.channels; channel++) {
				const dst = this.#samples[channel];
				for (let i = 0; i < gapSize; i++) dst[slot(write + i | 0, this.capacity)] = 0;
			}
		}
		for (let channel = 0; channel < this.channels; channel++) {
			const src = data[channel];
			const dst = this.#samples[channel];
			for (let i = 0; i < samples; i++) dst[slot(start + i | 0, this.capacity)] = src[offset + i];
		}
		Atomics.store(this.#control, WRITE, i32Max(Atomics.load(this.#control, WRITE), end));
		this.#resume();
	}
	#resume() {
		const read = readOf(Atomics.load(this.#state, 0));
		const write = Atomics.load(this.#control, WRITE);
		const latency = Atomics.load(this.#control, LATENCY);
		if ((write - read | 0) >= latency && latency > 0) Atomics.store(this.#control, STALLED, 0);
	}
	/**
	* Read audio samples into the output buffers.
	* AudioWorklet only. Returns the number of samples read.
	*/
	read(output) {
		const state = Atomics.load(this.#state, 0);
		if (Atomics.load(this.#control, STALLED) === 1) return 0;
		if (retreating(state)) return 0;
		let read = readOf(state);
		const write = Atomics.load(this.#control, WRITE);
		const latency = Atomics.load(this.#control, LATENCY);
		const buffered = write - read | 0;
		if (!this.buffered && latency > 0 && buffered > latency) {
			const skipTo = write - latency | 0;
			if ((skipTo - read | 0) > 0) read = skipTo;
		}
		const available = write - read | 0;
		const count = Math.min(available, output[0].length);
		if (count <= 0) {
			if ((read - readOf(state) | 0) > 0) Atomics.compareExchange(this.#state, 0, state, pack(epochOf(state), read));
			return 0;
		}
		for (let channel = 0; channel < this.channels; channel++) {
			const src = this.#samples[channel];
			const dst = output[channel];
			for (let i = 0; i < count; i++) dst[i] = src[slot(read + i | 0, this.capacity)];
		}
		const next = pack(epochOf(state), read + count | 0);
		if (Atomics.compareExchange(this.#state, 0, state, next) !== state) {
			for (let channel = 0; channel < this.channels; channel++) output[channel].fill(0, 0, count);
			return 0;
		}
		return count;
	}
	/**
	* Update the target latency in samples. Main thread only.
	*
	* A deeper floor parks playback until it refills. Video holds the extra delay on its own, so
	* audio that kept draining at the old depth would run ahead by the difference. Parking keeps
	* what is buffered, so a rise costs only its own size in silence, and none if the buffer
	* already covers the new floor.
	*/
	setLatency(samples) {
		const previous = Atomics.exchange(this.#control, LATENCY, samples);
		if (previous > 0 && samples > previous) {
			Atomics.store(this.#control, STALLED, 1);
			this.#step(2);
		}
		this.#resume();
	}
	/**
	* Drop buffered samples at or after \`timestamp\`, keeping whatever is already due.
	* Main thread only.
	*
	* A successor track overwrites the slots its own samples land on, but anything the previous
	* track wrote beyond them would otherwise still play once the successor runs out.
	*/
	truncate(timestamp) {
		const target = Math.round(Second.fromMicro(timestamp) * this.rate) - this.#anchor | 0;
		if ((Atomics.load(this.#control, WRITE) - target | 0) <= 0) return;
		this.#step(1);
		for (;;) {
			const write = Atomics.load(this.#control, WRITE);
			const clamped = i32Max(target, readOf(Atomics.load(this.#state, 0)));
			if ((write - clamped | 0) <= 0) break;
			if (Atomics.compareExchange(this.#control, WRITE, write, clamped) === write) break;
		}
		this.#step(1);
	}
	/**
	* Flush buffered samples and re-stall, ready to anchor the next utterance (buffered mode).
	* Main thread only. The worklet reader sees STALLED and stops until the next insert.
	*/
	reset() {
		this.#anchored = false;
		Atomics.store(this.#control, STALLED, 1);
		const write = Atomics.load(this.#control, WRITE);
		const state = Atomics.load(this.#state, 0);
		Atomics.store(this.#state, 0, pack(epochOf(state), write));
	}
	/**
	* Allocate a new ring with \`newCapacity\` samples and copy the unread window
	* [READ, WRITE) plus control state into it. Used when growing capacity so
	* we don't drop buffered audio. If \`newCapacity\` is smaller than the unread
	* span, the oldest samples are truncated.
	*
	* Main thread only. \`resize()\` reads from the source \`SharedRingBuffer\` and
	* writes into a freshly allocated buffer from \`allocSharedRingBuffer\`, so it
	* relies on the same invariant as \`insert()\`: no concurrent main-thread
	* writers. The AudioWorklet reader is tolerated via the CAS discipline used
	* by READ/WRITE elsewhere.
	*/
	resize(newCapacity) {
		const init = allocSharedRingBuffer(this.channels, newCapacity, this.rate, this.buffered);
		const dst = new SharedRingBuffer(init);
		dst.#anchored = this.#anchored;
		dst.#anchor = this.#anchor;
		const state = Atomics.load(this.#state, 0);
		const read = readOf(state);
		const write = Atomics.load(this.#control, WRITE);
		const latency = Atomics.load(this.#control, LATENCY);
		const stalled = Atomics.load(this.#control, STALLED);
		const available = write - read | 0;
		const copyCount = Math.max(0, Math.min(available, dst.capacity));
		const copyStart = write - copyCount | 0;
		for (let channel = 0; channel < this.channels; channel++) {
			const src = this.#samples[channel];
			const out = dst.#samples[channel];
			for (let i = 0; i < copyCount; i++) {
				const idx = copyStart + i | 0;
				out[slot(idx, dst.capacity)] = src[slot(idx, this.capacity)];
			}
		}
		Atomics.store(dst.#control, TIMELINE, Atomics.load(this.#control, TIMELINE));
		Atomics.store(dst.#state, 0, pack(epochOf(state), copyStart));
		Atomics.store(dst.#control, WRITE, write);
		Atomics.store(dst.#control, LATENCY, latency);
		Atomics.store(dst.#control, STALLED, stalled);
		dst.#position = this.#foldRead(read) + (copyStart - read | 0);
		dst.#lastRead = copyStart;
		return dst;
	}
	/**
	* Fold an observed READ into \`#position\`, so the returned offset keeps counting up across
	* the i32 wrap. Idempotent: folding the same value twice adds a zero delta.
	*/
	#foldRead(read) {
		this.#position += read - this.#lastRead | 0;
		this.#lastRead = read;
		return this.#position;
	}
	/** \`#foldRead\` against the current READ. */
	#unwrapRead() {
		return this.#foldRead(readOf(Atomics.load(this.#state, 0)));
	}
	/**
	* Current playback timestamp derived from READ position.
	*
	* Main thread only, and stateful: it advances the unwrapped read position, so it has to be
	* polled rather than sampled once. See \`#position\`.
	*/
	get timestamp() {
		return Micro.fromSecond((this.#anchor + this.#unwrapRead()) / this.rate);
	}
	/** Whether an insert has anchored the ring since it was created or reset. Main thread only. */
	get anchored() {
		return this.#anchored;
	}
	/** Whether the buffer is stalled (waiting to fill). */
	get stalled() {
		return Atomics.load(this.#control, STALLED) === 1;
	}
	/**
	* Number of buffered samples (WRITE - READ).
	*
	* Non-atomic: WRITE and READ are loaded separately, so a concurrent
	* writer/reader can make the two loads inconsistent. Intended for
	* tests and diagnostics, not control-flow decisions.
	*/
	get length() {
		return Atomics.load(this.#control, WRITE) - readOf(Atomics.load(this.#state, 0)) | 0;
	}
};
//#endregion
//#region src/audio/render-worklet.ts
var Render = class extends AudioWorkletProcessor {
	#backend;
	#underflow = 0;
	#stateCounter = 0;
	#epoch = 0;
	constructor() {
		super();
		this.port.onmessage = (event) => {
			const msg = event.data;
			if (msg.type === "init-shared") {
				console.log("[audio-worklet] init-shared: using SharedArrayBuffer path");
				const previous = this.#backend instanceof SharedRingBuffer ? this.#backend : void 0;
				this.#backend = new SharedRingBuffer(msg, previous);
				this.#underflow = 0;
			} else if (msg.type === "init-post") {
				console.log("[audio-worklet] init-post: using postMessage path");
				this.#backend = new AudioRingBuffer(msg);
				this.#underflow = 0;
			} else if (msg.type === "data") {
				if (this.#backend instanceof AudioRingBuffer) this.#backend.write(msg.timestamp, msg.data);
			} else if (msg.type === "latency") {
				if (this.#backend instanceof AudioRingBuffer) this.#backend.resize(msg.latency);
			} else if (msg.type === "truncate") {
				if (this.#backend instanceof AudioRingBuffer) this.#backend.truncate(msg.timestamp);
			} else if (msg.type === "reset") {
				if (this.#backend instanceof AudioRingBuffer) this.#backend.reset();
				this.#epoch = msg.epoch;
			}
		};
	}
	process(_inputs, outputs, _parameters) {
		const output = outputs[0];
		const backend = this.#backend;
		const samplesRead = backend?.read(output) ?? 0;
		if (samplesRead < output[0].length) this.#underflow += output[0].length - samplesRead;
		else if (this.#underflow > 0 && backend) {
			console.debug(\`audio underflow: \${Math.round(1e3 * this.#underflow / backend.rate)}ms\`);
			this.#underflow = 0;
		}
		if (backend instanceof AudioRingBuffer) {
			this.#stateCounter++;
			if (this.#stateCounter >= 5) {
				this.#stateCounter = 0;
				const state = {
					type: "state",
					timestamp: backend.timestamp,
					stalled: backend.stalled,
					anchored: backend.anchored,
					epoch: this.#epoch
				};
				this.port.postMessage(state);
			}
		}
		return true;
	}
};
registerProcessor("render", Render);
//#endregion
`],{type:"application/javascript"}),hr=URL.createObjectURL(lr),dr=class{#t=0;#e;#n;#i;#s=0;#r;get end(){return this.#e}clear(t=0){this.#t=0,this.#e=void 0,this.#s=t,this.#a()}update(t){let e=t.discontinuity!==this.#t;return e&&(this.#t=t.discontinuity,this.#e=void 0,this.#a()),t.frame&&t.group!==this.#n&&(this.#e=void 0),t.frame&&this.#i===void 0&&(this.#i=t.frame.timestamp),t.end!==void 0&&(this.#e=t.end,this.#n=t.group),e}span(t){let e=this.#i??t.timestamp;this.#i=e;let i=Math.floor(this.#s*t.sampleRate/48e3),n=this.#r??i,s=Math.min(n,t.numberOfFrames);this.#r=n-s;let r=Math.round(i*1e6/t.sampleRate),a=Math.max(e,t.timestamp-r),o=t.numberOfFrames-s;if(this.#e!==void 0)if(this.#e<=a)o=0;else{let c=this.#e-a,l=Math.round(c*t.sampleRate/1e6);o=Math.min(o,l)}return{timestamp:a,frameOffset:s,frames:o}}#a(){this.#i=void 0,this.#r=void 0}},ur=class{#t;constructor(t){this.#t=t}drop(){return this.#t!==0&&(this.#t--,!0)}},fr=3,fe=class{in;source;sync;#t={context:new u(void 0),root:new u(void 0),sampleRate:new u(void 0),stats:new u(void 0),timestamp:new u(void 0),stalled:new u(!0),buffered:new u([])};out=_(this.#t);#e=new u([]);#n;#i=new u(void 0);#s=new dr;#r=new or;#a=new T;#o;#c;constructor(t){this.in={enabled:b(t?.enabled??!0)},this.source=t.source,this.sync=t.sync,this.#a.cleanup(this.sync.register(this.source.out.jitter)),this.#o=this.#a.computed(e=>{let i=e.get(this.source.out.config);return i?sr(i):void 0}),this.#c=this.#a.computed(e=>{let i=e.get(this.source.out.config);return i?Ve(i):void 0}),this.#a.run(this.#h.bind(this)),this.#a.run(this.#d.bind(this)),this.#a.run(this.#l.bind(this)),this.#a.run(this.#m.bind(this))}#h(t){let e=t.get(this.#c);if(!e)return;let i=t.get(this.#i)??e.sampleRate,n=e.numberOfChannels;t.set(this.#t.sampleRate,i);let s=new AudioContext({latencyHint:"interactive",sampleRate:i});t.set(this.#t.context,s),t.cleanup(()=>s.close()),t.spawn(async()=>{if(!await t.race(s.audioWorklet.addModule(hr).then(()=>!0)))return;let r=new AudioWorkletNode(s,"render",{channelCount:n,channelCountMode:"explicit",outputChannelCount:[n]});t.cleanup(()=>r.disconnect());let a=this.sync.out.delay.peek(),o=de(i,a),c=this.sync.out.buffered.peek(),l=Ks(r,n,i,o,c);this.#n=l,t.cleanup(()=>{l.close(),this.#n=void 0}),t.run(h=>{let d=f.fromMicro(h.get(l.timestamp));this.#t.timestamp.set(d),this.#k(d)}),t.run(h=>{this.#t.stalled.set(h.get(l.stalled))}),t.set(this.#t.root,r)})}#d(t){if(!t.get(this.in.enabled))return;if(t.get(this.sync.in.delay)==="instant"){this.reset();return}let e=t.get(this.#t.context);e&&Ni(t,e)}#l(t){if(!t.get(this.#t.root))return;let e=this.#n;if(!e)return;let i=t.get(this.sync.out.delay);e.setLatency(de(e.rate,i))}#m(t){if(!t.get(this.in.enabled)||t.get(this.sync.in.delay)==="instant")return;let e=t.get(this.source.in.broadcast);if(!e)return;let i=t.get(this.source.out.track);if(!i)return;let n=t.get(this.#o);if(!n)return;let s=n.decoder,r=e.relativeBroadcast(t,n.broadcast);if(!r)return;this.#r.opened();let a=Pt(t,{broadcast:r,track:i,priority:vt.audio,maxAge:this.sync.out.maxAge});a&&(s.container.kind==="cmaf"?this.#y(t,a,s):this.#u(t,a,s))}#u(t,e,i){let n=i.codec==="opus"&&i.description?Gt(U(i.description)):0;this.#s.clear(n);let s=i.container.kind==="loc"?new jt("audio"):new Nt(i),r=new pt(e,{format:s,maxAge:this.sync.out.maxAge});t.cleanup(()=>r.close()),t.run(a=>{let o=a.get(r.buffered),c=a.get(this.#e);this.#t.buffered.update(()=>mt(o,c))}),t.spawn(async()=>{if(!await Vt())return;let a=new ur(fr),o=new AudioDecoder({output:p=>{let g=this.#s.span(p);if(a.drop()){p.close();return}this.#A(p,g)},error:p=>console.error("audio decoder error",p)});t.cleanup(()=>{o.state!=="closed"&&o.close()});let c=i.codec==="opus"?void 0:i.description?U(i.description):void 0,l={codec:i.codec,sampleRate:i.sampleRate,numberOfChannels:i.numberOfChannels,description:c};o.configure(l);let h=this.#f(),d;for(;;){let p=await bt(r);if((p===void 0||p.end!==void 0||p.discontinuity!==(d??p.discontinuity))&&!await this.#g(t,o,l,h,h.flush()))return;if(!p)break;if(d=p.discontinuity,p.frame===void 0||p.end!==void 0){this.#b(p)&&(o.reset(),o.configure(l),h.reset());continue}let{frame:g}=p,v=f.fromMicro(g.timestamp);if(this.sync.received(v,"audio"),this.#t.stats.update(y=>({bytesReceived:(y?.bytesReceived??0)+g.payload.byteLength})),!await this.#g(t,o,l,h,h.push({...p,frame:g})))return}})}#y(t,e,i){if(i.container.kind!=="cmaf")return;let n=lt(i.container.init),s=At(n),r=i.description?U(i.description):s.description,a=i.codec==="opus"&&r?Gt(r):0;this.#s.clear(a);let o=i.codec==="opus"?void 0:i.description?U(i.description):s.description,c=new pt(e,{format:new ze(s),maxAge:this.sync.out.maxAge});t.cleanup(()=>c.close()),t.run(l=>{let h=l.get(c.buffered),d=l.get(this.#e);this.#t.buffered.update(()=>mt(h,d))}),t.spawn(async()=>{if(!await Vt())return;let l=new AudioDecoder({output:g=>this.#A(g),error:g=>console.error("audio decoder error",g)});t.cleanup(()=>{l.state!=="closed"&&l.close()});let h={codec:i.codec,sampleRate:i.sampleRate,numberOfChannels:i.numberOfChannels,description:o};l.configure(h);let d=this.#f(),p;for(;;){let g=await bt(c);if((g===void 0||g.end!==void 0||g.discontinuity!==(p??g.discontinuity))&&!await this.#g(t,l,h,d,d.flush()))return;if(!g)break;if(p=g.discontinuity,g.frame===void 0){this.#b(g)&&(l.reset(),l.configure(h),d.reset());continue}let{frame:v}=g,y=f.fromMicro(v.timestamp);if(this.sync.received(y,"audio"),this.#t.stats.update(A=>({bytesReceived:(A?.bytesReceived??0)+v.payload.byteLength})),!await this.#g(t,l,h,d,d.push({...g,frame:v})))return}})}#f(){return this.sync.out.buffered.peek()?new ue(()=>({floor:W.fromMilli(this.sync.out.delay.peek()),maxDelay:W.fromMilli(this.sync.out.maxAge.peek())})):new ue(void 0)}async#g(t,e,i,n,s){for(let r of s){if(this.#b(r)&&(e.reset(),e.configure(i),n.reset()),!n.admit(r))continue;let{frame:a}=r;if(await this.#n?.wait(a.timestamp,t.abort),e.state==="closed")return!1;e.decode(new EncodedAudioChunk({type:a.keyframe?"key":"delta",data:a.payload,timestamp:a.timestamp}))}return!0}#A(t,e=this.#s.span(t)){let{timestamp:i,frameOffset:n,frames:s}=e,r=f.fromMicro(i);if(s===0){t.close();return}let a=this.#n;if(!a){t.close();return}if(t.sampleRate!==a.rate){this.#i.set(t.sampleRate),t.close();return}let o=s/t.sampleRate*1e6,c=f.fromMicro(o),l=f.add(r,c);this.#r.takeover()&&(a.truncate(i),this.#v(r)),this.#w(r,l);let h=Math.min(t.numberOfChannels,a.channels),d=[];for(let p=0;p<h;p++){let g=new Float32Array(s);t.copyTo(g,{format:"f32-planar",planeIndex:p,frameOffset:n,frameCount:s}),d.push(g)}a.insert(i,d),t.close()}#w(t,e){t>e||this.#e.mutate(i=>{for(let n of i)if(t<=n.end+1&&e>=n.start){n.start=f.min(n.start,t),n.end=f.max(n.end,e);return}i.push({start:t,end:e}),i.sort((n,s)=>n.start-s.start)})}#v(t){this.#e.mutate(e=>{for(;e.length>0&&e[e.length-1].start>=t;)e.pop();let i=e[e.length-1];i&&i.end>t&&(i.end=t)})}#k(t){this.#e.mutate(e=>{for(;e.length>0;){if(e[0].end>=t){e[0].start=f.max(e[0].start,t);break}e.shift()}})}reset(){this.#n?.reset()}#b(t){return this.#s.update(t)?(this.#n?.reset(),this.sync.reset(),!0):!1}close(){this.#a.close()}static supported=pr};async function pr(t){if(!Se(t.container)){let i=t.container.kind==="unknown"?t.container.raw.kind:t.container.kind;return console.warn(`audio: ignoring rendition with unknown container: ${i}`),!1}t.codec==="opus"&&!Bi(t.sampleRate)&&console.warn(`audio: opus advertised at ${t.sampleRate}Hz, which some browsers cannot decode`);let e;if(t.codec!=="opus"){if(t.description)e=U(t.description);else if(t.container.kind==="cmaf")try{e=At(lt(t.container.init)).description}catch(i){return console.warn(`audio: malformed CMAF init segment for codec ${t.codec}`,i),!1}}return(await AudioDecoder.isConfigSupported({...t,description:e})).supported??!1}var pe=.001,Tt=.2,mr=class{source;in;#t={enabled:new u(!1)};out=_(this.#t);#e=new T;#n=new u(void 0);constructor(t){this.source=t.source,this.in={volume:b(t?.volume??.5),muted:b(t?.muted??!1),paused:b(t?.paused??!1)},this.#e.run(e=>{let i=!e.get(this.in.paused)&&!e.get(this.in.muted);this.#t.enabled.set(i)}),this.#e.run(e=>{let i=e.get(this.source.out.root);if(!i)return;let n=new GainNode(i.context,{gain:e.get(this.in.volume)});i.connect(n),e.set(this.#n,n),e.run(s=>{s.get(this.#t.enabled)&&(n.connect(i.context.destination),s.cleanup(()=>n.disconnect()))})}),this.#e.run(e=>{let i=e.get(this.#n);if(!i)return;e.cleanup(()=>i.gain.cancelScheduledValues(i.context.currentTime));let n=e.get(this.in.volume);n<pe?(i.gain.exponentialRampToValueAtTime(pe,i.context.currentTime+Tt),i.gain.setValueAtTime(0,i.context.currentTime+Tt+.01)):i.gain.exponentialRampToValueAtTime(n,i.context.currentTime+Tt)})}close(){this.#e.close()}},gr=class{in;#t={catalog:new u(void 0),available:new u({}),track:new u(void 0),config:new u(void 0),jitter:new u(void 0)};out=_(this.#t);#e=new T;constructor(t){this.in={broadcast:b(t?.broadcast),target:b(t?.target),supported:b(t?.supported)},this.#e.run(this.#n.bind(this)),this.#e.run(this.#i.bind(this)),this.#e.run(this.#s.bind(this))}#n(t){let e=t.get(this.in.broadcast);if(!e)return;let i=t.get(e.out.catalog)?.audio;i&&t.set(this.#t.catalog,i)}#i(t){let e=t.get(this.#t.catalog)?.renditions??{},i=t.get(this.in.supported);i&&t.spawn(async()=>{let n={};for(let[s,r]of Object.entries(e)){let a=await t.race(i(r));if(t.abort.aborted)return;a&&(n[s]=r)}Object.keys(n).length===0&&Object.keys(e).length>0&&console.warn("no supported audio renditions found:",e),this.#t.available.set(n)})}#s(t){let e=t.get(this.#t.available);if(Object.keys(e).length===0)return;let i=t.get(this.in.target),n;if(i?.name&&i.name in e)n={track:i.name,config:e[i.name]};else if(n=this.#r(e),!n)return;t.set(this.#t.track,n.track),t.set(this.#t.config,n.config),t.set(this.#t.jitter,rr(n.config))}#r(t){let e=Object.entries(t);if(e.length!==0){for(let[i,n]of e)if(n.container.kind==="legacy")return{track:i,config:n};for(let[i,n]of e)if(n.container.kind==="loc")return{track:i,config:n};for(let[i,n]of e)if(n.container.kind==="cmaf")return{track:i,config:n}}}close(){this.#e.close()}},br=48e3,me=2;function yr(t){let e="";for(let i=0;i<t.length;i++)e+=t[i].toString(16).padStart(2,"0");return e}function Ye(t){let e;try{e=t.initData?lt(t.initData):void 0}catch{e=void 0}let i=e?yr(e):void 0;switch(t.packaging){case"cmaf":return!t.initData||!e?void 0:{container:{kind:"cmaf",init:t.initData},description:void 0};case"loc":return{container:{kind:"loc"},description:i};case"legacy":return{container:{kind:"legacy"},description:i};default:return}}function Ke(t){if(!(t<=0))return N(Math.ceil(t))}function wr(t){if(!t.codec)return;let e=Ye(t);if(!e)return;let{container:i,description:n}=e;return{codec:t.codec,container:i,description:n,codedWidth:t.width==null?void 0:N(t.width),codedHeight:t.height==null?void 0:N(t.height),framerate:t.framerate,bitrate:t.bitrate==null?void 0:N(t.bitrate),stalled:t.stalled,jitter:t.jitter==null?void 0:N(t.jitter),delay:t.delay==null?void 0:Ke(t.delay)}}function vr(t){if(!t.codec)return;let e=(()=>{if(!t.channelConfig)return me;let r=Number.parseInt(t.channelConfig,10);return Number.isFinite(r)?r:me})(),i=Ye(t);if(!i)return;let{container:n,description:s}=i;return{codec:t.codec,container:n,description:s,sampleRate:N(t.samplerate??br),numberOfChannels:N(e),bitrate:t.bitrate==null?void 0:N(t.bitrate),jitter:t.jitter==null?void 0:N(t.jitter),delay:t.delay==null?void 0:Ke(t.delay)}}function Ar(t){let e={},i={};for(let s of t.tracks)if(s.role==="video"){let r=wr(s);r&&(e[s.name]=r)}else if(s.role==="audio"){let r=vr(s);r&&(i[s.name]=r)}let n={};return Object.keys(e).length>0&&(n.video={renditions:e}),Object.keys(i).length>0&&(n.audio={renditions:i}),n}function it(t,e){return Object.fromEntries(Object.entries(t).filter(([,i])=>e(i.broadcast)))}function kr(t,e){return{...t,video:t.video?{...t.video,renditions:it(t.video.renditions,e)}:void 0,audio:t.audio?{...t.audio,renditions:it(t.audio.renditions,e)}:void 0,text:t.text?{...t.text,renditions:it(t.text.renditions,e)}:void 0,json:t.json?{...t.json,tracks:it(t.json.tracks,e)}:void 0,binary:t.binary?{...t.binary,tracks:it(t.binary.tracks,e)}:void 0}}var xr=[...Oi,"hangz","manual"],Sr=class{in;#t={status:new u("offline"),active:new u(void 0),catalog:new u(void 0)};out=_(this.#t);#e=new u(void 0);#n=new u(!1);#i=new u(void 0);#s;constructor(t){if(t&&"reload"in t)throw Error("Watch.Broadcast: `reload` was renamed to `announced`");this.#s=new T,this.in={origin:b(t?.origin),name:b(t?.name??zt()),enabled:b(t?.enabled??!0),announced:b(t?.announced??!0),catalogFormat:b(t?.catalogFormat),catalog:b(t?.catalog)},this.#s.run(this.#r.bind(this)),this.#s.run(this.#h.bind(this)),this.#s.run(this.#d.bind(this)),this.#s.run(this.#a.bind(this))}#r(t){if(this.#e.set(void 0),!t.get(this.#n)||!t.get(this.in.announced))return;let e=t.get(this.in.origin);if(!e)return;let i=e.announced();t.cleanup(()=>i.close()),this.#e.set(new Set),t.spawn(async()=>{for(;;){let n=await t.race(i.next());if(!n)break;this.#e.mutate(s=>{s&&(Si(n.kind)?s.add(n.prefix):s.delete(n.prefix))})}})}#a(t){let e=t.get(this.#i);t.set(this.#t.catalog,e?kr(e,i=>this.#l(t,i)!==void 0):void 0)}#o(t,e){this.#n.set(!0);let i=t.get(this.#e);if(!i)return!1;if(i.has(e))return!0;for(let n of i)if(Ti(n,e))return!0;return!1}#c(t,e,i){let n=e.request(i);return t.cleanup(()=>n.close()),t.get(n.active)}#h(t){if(!t.get(this.in.enabled))return;let e=t.get(this.in.origin);if(!e)return;let i=t.get(this.in.name);if(!t.get(this.in.announced)){t.set(this.#t.active,this.#c(t,e,i),void 0);return}let n=e.request(i,{announced:!0});t.cleanup(()=>n.close()),t.run(s=>{s.set(this.#t.active,s.get(n.active),void 0)})}#d(t){if(!t.get(this.in.enabled))return;let e=t.get(this.in.catalogFormat),i=t.get(this.in.name),n=e??Ci(i)??Li;if(n==="manual"){let c=t.get(this.in.catalog),l;try{l=c&&Xt(Jt(c),i)}catch(h){console.error("rejecting catalog",i,h)}this.#i.set(l,!0),t.cleanup(()=>this.#i.set(void 0,!0)),this.#t.status.set(l?"live":"loading");return}let s=t.get(this.out.active);if(!s||t.get(s.closed)!==void 0)return;this.#t.status.set("loading");let r=n==="hang"?_i:n==="hangz"?zi:"catalog",a=s.track(r).subscribe({priority:vt.catalog});t.cleanup(()=>a.close());let o;if(n==="hang"||n==="hangz"){let c=new Xi({track:a,schema:rn,compression:n==="hangz"?"deflate":"none"});o=()=>c.next()}else{let c=a.ordered();o=async()=>{let l=await Kn(c);return l?Ar(l):void 0}}t.spawn(async()=>{try{for(;;){let c=await t.race(o());if(!c)break;console.debug("received catalog",n,this.in.name.peek(),c),this.#i.set(Xt(Jt(c),i),!0),this.#t.status.set("live")}}catch(c){c instanceof J?console.debug("catalog subscription ended",this.in.name.peek(),c):console.error("error fetching catalog",this.in.name.peek(),c)}finally{this.#i.set(void 0),this.#t.status.set("offline")}})}#l(t,e){if(!e)return{local:!0};let i=t.get(this.in.name),n=ke(i,e);if(n===void 0){console.warn("ignoring rendition: broadcast reference escapes the root",i,e);return}if(n===i)return{local:!0};let s=t.get(this.in.origin);if(!s||!(t.get(this.in.announced)&&t.get(s.discovery)!==!1&&!this.#o(t,n)))return{local:!1,path:n}}relativeBroadcast(t,e){let i=this.#l(t,e);if(!i)return;if(i.local)return t.get(this.out.active);if(!t.get(this.in.enabled))return;let n=t.get(this.in.origin);if(n)return this.#c(t,n,i.path)}close(){this.#s.close()}},Tr=f(20),ge=f(100),Er=class Je{in;#t={reference:new u(void 0),delay:new u(f.zero),jitter:new u(ge),timestamp:new u(void 0),buffered:new u(!1),maxAge:new u(f.zero)};out=_(this.#t);#e=new Map;#n;#i=new u([]);#s=new T;constructor(e){this.in={delay:b(e?.delay??"auto"),buffer:b(e?.buffer??f.zero),probe:b(e?.probe)},this.#s.run(this.#a.bind(this)),this.#s.run(this.#o.bind(this)),this.#s.run(this.#r.bind(this))}register(e){let i={jitter:e};return this.#i.update(n=>[...n,i]),()=>this.#i.update(n=>n.filter(s=>s!==i))}#r(e){let i=e.get(this.#t.delay),n=e.get(this.in.delay)==="instant"?f.zero:e.get(this.in.buffer);this.#t.buffered.set(n>0),this.#t.maxAge.set(f.add(i,n))}#a(e){let i=e.get(this.in.delay);if(i==="instant"){this.#n=void 0,this.#t.jitter.set(f.zero);return}if(typeof i=="number"){this.#n=void 0,this.#t.jitter.set(i);return}let n=e.get(this.in.probe)?.rtt;if(n!==void 0){this.#n=this.#n===void 0?n:Math.min(this.#n,n);let s=f(Math.max(Tr,this.#n*1.25));this.#t.jitter.set(s);return}this.#n=void 0,this.#t.jitter.set(ge)}#o(e){let i=e.get(this.in.delay);if(typeof i=="number"){this.#t.delay.set(i);return}let n=e.get(this.#t.jitter),s=f.zero;for(let a of e.get(this.#i))s=f.max(s,e.get(a.jitter)??f.zero);let r=i==="instant"?f.zero:f.add(s,n);this.#t.delay.set(r)}received(e,i=""){this.#t.timestamp.update(l=>l===void 0||e>l?e:l);let n=f.now(),s=f.sub(n,e),r=this.#t.reference.peek();if(r===void 0){this.#t.reference.set(s);return}let a=this.#t.delay.peek(),o=f.add(f.sub(r,s),a);if(o<0){let l=this.#e.get(i);l?(l.count++,l.maxMs=Math.max(l.maxMs,-o)):this.#e.set(i,{count:1,maxMs:-o})}else{let l=this.#e.get(i);if(l){let h=i?`sync[${i}]`:"sync",d=Je.#h(l.maxMs);console.debug(`${h}: ${l.count} late frame(s), max ${d} behind`),this.#e.delete(i)}}if(s>=r)return;let c=this.#t.maxAge.peek();o<=c||this.#t.reference.set(f.add(s,f.sub(c,a)))}reset(){this.#t.reference.set(void 0),this.#e.clear()}now(){let e=this.#t.reference.peek();if(e!==void 0)return f.sub(f.sub(f.now(),e),this.#t.delay.peek())}async wait(e){if(this.in.delay.peek()!=="instant"){if(this.#t.reference.peek()===void 0)throw Error("reference not set; call received() first");for(;;){if(this.in.delay.peek()==="instant")return;let i=f.now(),n=f.sub(i,e),s=this.#t.reference.peek();if(s===void 0)return;let r=f.add(f.sub(s,n),this.#t.delay.peek());if(r<=0||r<5||await this.#c(r))return}}}#c(e){return new Promise(i=>{let n=a=>{clearTimeout(s);for(let o of r)o();i(a)},s=setTimeout(()=>n(!0),e),r=[this.in.delay.changed(()=>n(!1)),this.#t.delay.changed(()=>n(!1)),this.#t.reference.changed(()=>n(!1))]})}static#h(e){if(e=Math.round(e),e<1e3)return`${e}ms`;let i=e/1e3;if(i<60)return`${Math.round(i*10)/10}s`;let n=i/60;return`${Math.round(n*10)/10}m`}close(){this.#s.close()}},Mr=`:where([part=captions]){--overlay-padding:1%;--cue-color:white;--cue-bg-color:#000c;--cue-font-size:calc(var(--overlay-height) / 100 * 5);--cue-line-height:calc(var(--cue-font-size) * 1.2);--cue-padding-x:calc(var(--cue-font-size) * .6);--cue-padding-y:calc(var(--cue-font-size) * .4);z-index:1;contain:content;margin:var(--overlay-padding);font-size:var(--cue-font-size);box-sizing:border-box;pointer-events:none;user-select:none;word-spacing:normal;word-break:break-word;font-family:sans-serif;position:absolute;inset:0}:where([part=captions]>[part=cue-display]){contain:content;top:var(--cue-top);left:var(--cue-left);right:var(--cue-right);bottom:var(--cue-bottom);width:var(--cue-width,auto);height:var(--cue-height,auto);box-sizing:border-box;transform:var(--cue-transform);text-align:var(--cue-text-align);writing-mode:var(--cue-writing-mode,unset);white-space:pre-line;direction:ltr;unicode-bidi:plaintext;min-width:min-content;min-height:min-content;position:absolute;overflow:visible}:where([data-dir=rtl] [part=cue-display]){direction:rtl}:where([part=captions] [part=cue]){padding:var(--cue-padding-y) var(--cue-padding-x);line-height:var(--cue-line-height);background-color:var(--cue-bg-color);box-sizing:border-box;color:var(--cue-color);box-shadow:var(--cue-box-shadow);white-space:var(--cue-white-space,pre-wrap);outline:var(--cue-outline);text-shadow:var(--cue-text-shadow);display:inline-block}:where([part=captions] [part=cue-display][data-vertical] [part=cue]){padding:var(--cue-padding-x) var(--cue-padding-y)}
:where([part=captions] [part=region]){width:var(--region-width);height:var(--region-height);min-height:0;max-height:var(--region-height);writing-mode:horizontal-tb;top:calc(var(--region-top,var(--overlay-height) * var(--region-viewport-anchor-y) / 100 - var(--region-height) * var(--region-anchor-y) / 100));left:var(--region-left,calc(calc(var(--region-viewport-anchor-x) * 1%) - calc(var(--region-width) * var(--region-anchor-x) / 100)));right:var(--region-right);bottom:var(--region-bottom);overflow-wrap:break-word;box-sizing:border-box;flex-flow:column;justify-content:flex-start;display:inline-flex;position:absolute;overflow:hidden}:where([part=captions] [part=region][data-scroll=up]){justify-content:end}:where([part=captions] [part=region][data-active][data-scroll=up]){transition:top .433s}:where([part=captions] [part=region]>[part=cue-display]){width:auto;left:var(--cue-offset);height:var(--cue-height,auto);text-align:var(--cue-text-align);unicode-bidi:plaintext;margin-top:1px;position:relative}:where([part=captions] [part=region] [part=cue]){padding:calc(var(--cue-padding-y) / 2) var(--cue-padding-x);border-radius:0;position:relative}`,Rr=f(3e4),Ir=f(3e4),Or=f(1e3);function be(t){return t.replaceAll("&","&amp;amp;").replaceAll("<","&amp;lt;").replaceAll(">","&amp;gt;").replaceAll('"',"&amp;quot;")}function ye(t,e){let i=t.length;for(;i>0&&t[i-1].startTime>e.startTime;)i--;t.splice(i,0,e)}function Cr(t,e){let{cues:i,clears:n}=t,s=0;for(let a of n)a>=e&&(n[s++]=a);n.length=s;let r=0;for(let a of i)a.endTime>=e&&(i[r++]=a);return r!==i.length&&(i.length=r,!0)}function Lr(t,e){let{cues:i,clears:n}=t,s=i.indexOf(e),r=s>0?i[s-1]:void 0;r&&r.endTime>e.startTime&&(r.endTime=e.startTime);let a=i[s+1];a&&e.endTime>a.startTime&&(e.endTime=a.startTime);let o=n.find(c=>c>e.startTime);o!==void 0&&e.endTime>o&&(e.endTime=o)}function _r(t,e){let{cues:i,clears:n}=t,s=n.length;for(;s>0&&n[s-1]>e;)s--;n[s]!==e&&n.splice(s,0,e);for(let r=i.length-1;r>=0;r--){let a=i[r];if(!(a.startTime>e)){a.endTime>e&&(a.endTime=e);return}}}var zr=class{source;sync;in;#t=new T;#e=!1;constructor(t){this.source=t.source,this.sync=t.sync,this.in={container:b(t?.container),enabled:b(t?.enabled??!0)},this.#t.run(this.#n.bind(this))}#n(t){let e=t.getAll([this.in.enabled,this.in.container,this.source.out.track,this.source.out.config,this.source.in.broadcast]);if(!e)return;let[i,n,s,r,a]=e,o=a.relativeBroadcast(t,r.broadcast);if(!o)return;this.#e=!1;let c;if(r.container.kind==="legacy")c=new Nt("data");else if(r.container.kind==="loc")c=new jt;else{console.warn(`captions: unsupported container "${r.container.kind}" for track ${s}`);return}let l=document.createElement("style");l.textContent=Mr,n.appendChild(l),t.cleanup(()=>l.remove());let h=document.createElement("div");h.style.position="absolute",h.style.inset="0",h.style.pointerEvents="none",n.appendChild(h),t.cleanup(()=>h.remove());let d=new $s(h);t.cleanup(()=>d.destroy());let p=Pt(t,{broadcast:o,track:s,priority:vt.text,maxAge:this.sync.out.maxAge});if(!p)return;let g={cues:[],regions:new Map,clears:[]},v=()=>d.changeTrack({cues:[...g.cues],regions:[...g.regions.values()]}),y=()=>{let A=this.sync.now();A!==void 0&&(d.currentTime=A/1e3,Cr(g,(A-Rr)/1e3)&&v()),t.animate(y)};t.animate(y),t.spawn(async()=>{for(;;){let A=await p.recvGroup().catch(S=>{if(!(S instanceof J))throw S;console.debug("captions subscription ended",S)});if(!A)break;t.spawn(async()=>{try{for(;;){let S=await A.readFrame();if(!S)break;for(let G of c.decode(S.payload))await this.#i(r.format,G,g)}}catch(S){if(!(S instanceof J))throw S}finally{A.close()}v()})}})}async#i(t,e,i){let n=new TextDecoder().decode(e.payload),s=e.timestamp/1e6;if(t==="utf8"){if(n.length===0){_r(i,s);return}let o=new Ne(s,s+Ir/1e3,be(n));ye(i.cues,o),Lr(i,o);return}if(n.length===0)return;let r;try{r=await Xn(n,{type:"vtt"})}catch(o){console.warn("captions: failed to parse VTT cue",o);return}let a=r.cues.at(0);!this.#e&&a&&Math.abs(a.startTime-s)>Or/1e3&&(this.#e=!0,console.warn(`captions: cue timing is ${(a.startTime-s).toFixed(3)}s off its frame timestamp; the payload must carry absolute times on the media clock`));for(let o of r.regions)i.regions.set(o.id,o);for(let o of r.cues)o.text=be(o.text),ye(i.cues,o)}close(){this.#t.close()}},Nr=new Set(["vtt","utf8"]);function Br(t){return Nr.has(t.format)}var jr=class{in;#t={catalog:new u(void 0),available:new u({}),track:new u(void 0),config:new u(void 0)};out=_(this.#t);#e=new T;constructor(t){this.in={broadcast:b(t?.broadcast),target:b(t?.target)},this.#e.run(this.#n.bind(this)),this.#e.run(this.#i.bind(this))}#n(t){let e=t.get(this.in.broadcast),i=e?t.get(e.out.catalog)?.text:void 0;t.set(this.#t.catalog,i),this.#t.available.set(i?.renditions??{})}#i(t){let e=t.get(this.#t.available),i=t.get(this.in.target),n=i?e[i]:void 0;if(!i||!n){t.set(this.#t.track,void 0),t.set(this.#t.config,void 0);return}Br(n)||console.warn(`captions: unsupported format ${JSON.stringify(n.format)} for track ${i}`),t.set(this.#t.track,i),t.set(this.#t.config,n)}close(){this.#e.close()}},Xe=Symbol("supportCacheKey");function Ze(t){return{broadcast:t.broadcast,decoder:{codec:t.codec,container:t.container,description:t.description,displayAspectWidth:t.displayAspectWidth,displayAspectHeight:t.displayAspectHeight,optimizeForLatency:t.optimizeForLatency??!0}}}function Dr(t){return JSON.stringify(Ze(t).decoder)}var Fr=f(100);function Ur(t){let e;return t.jitter===void 0?t.framerate&&(e=f(Math.ceil(1e3/t.framerate))):e=f(t.jitter),t.delay===void 0?e:f.add(f(t.delay),e??f.zero)}function Pr(t){return t.active===void 0||f.add(t.playhead,Fr)>=t.active}function $r(t){return t.active===void 0?t.pending:t.pending===void 0?t.active:f.max(t.active,t.pending)}function Qe(t=0){let e=(t%360+360)%360;return Math.round(e/90)%4*90}function ti(t,e=0){let i=Qe(e);return i===90||i===270?{width:t.height,height:t.width}:{width:t.width,height:t.height}}function K(t){return Object.is(t,-0)?0:t}function Wr(t,e){let[i,n,s,r,a,o]=t;return[K(-i),K(n),K(-s),K(r),K(e-a),K(o)]}function qr(t,e){let i=Qe(e?.rotation),n=ti(t,i),s;switch(i){case 90:s=[0,1,-1,0,t.width,0];break;case 180:s=[-1,0,0,-1,t.width,t.height];break;case 270:s=[0,-1,1,0,0,t.height];break;default:s=[1,0,0,1,0,0]}return e?.flip&&(s=Wr(s,t.width)),{matrix:s,source:n}}var Hr=f(500),we=class{in;source;sync;#t={frame:new u(void 0),timestamp:new u(void 0),display:new u(void 0),stalled:new u(!1),stats:new u(void 0),jitter:new u(void 0),buffered:new u([])};out=_(this.#t);#e=new u(void 0);#n=new u(void 0);#i;#s=new T;#r(){this.#t.frame.update(t=>{t?.close()}),this.#t.timestamp.set(void 0)}constructor(t){this.in={enabled:b(t?.enabled??!0)},this.source=t.source,this.sync=t.sync,this.#s.cleanup(this.sync.register(this.out.jitter)),this.#i=this.#s.computed(e=>{let i=e.get(this.source.out.config);return i?Ze(i):void 0}),this.#s.run(this.#a.bind(this)),this.#s.run(this.#o.bind(this)),this.#s.run(this.#c.bind(this)),this.#s.run(this.#h.bind(this)),this.#s.run(this.#d.bind(this))}#a(t){let e=(a,o)=>{if(a===void 0||o===void 0)return;let c=t.get(o)?.video?.renditions?.[a];return c&&Ur(c)},i=t.get(this.#e),n=e(i?.track,i?.catalog),s=t.get(this.#n),r=e(s?.track,s?.catalog);t.set(this.#t.jitter,$r({active:n,pending:r}))}#o(t){let e=t.getAll([this.in.enabled,this.source.in.broadcast,this.source.out.track,this.#i]);if(!e){this.#e.set(void 0);return}let[i,n,s,r]=e,a=n.relativeBroadcast(t,r.broadcast);if(!a){this.#e.set(void 0),this.#r(),this.#t.buffered.set([]);return}let o=new Gr({sync:this.sync,broadcast:a,track:s,config:r.decoder,stats:this.#t.stats,catalog:n.out.catalog});t.set(this.#n,{track:s,catalog:n.out.catalog}),t.cleanup(()=>o?.close()),t.run(c=>{if(!o)return;let l=c.get(this.#e);if(l){let h=c.get(o.timestamp);if(h===void 0||!Pr({playhead:h,active:c.get(l.timestamp)}))return}this.#e.set(o),this.#n.set(void 0),o=void 0,c.close()})}#c(t){let e=t.get(this.#e);if(!e){this.#t.buffered.set([]);return}t.cleanup(()=>e.close()),t.run(i=>{let n=i.get(e.frame);n&&(this.#t.timestamp.set(f.fromMicro(n.timestamp)),this.#t.frame.update(s=>(s?.close(),n.clone())))}),t.proxy(this.#t.buffered,e.buffered)}#h(t){let e=t.get(this.source.out.catalog);if(!e)return;let i=e.display;if(i){t.set(this.#t.display,{width:i.width,height:i.height});return}let n=t.get(this.#t.frame);n&&t.set(this.#t.display,ti({width:n.displayWidth,height:n.displayHeight},e.rotation))}#d(t){if(t.get(this.in.enabled)){if(!t.get(this.#t.frame)){this.#t.stalled.set(!0);return}this.#t.stalled.set(!1),t.timer(()=>{this.#t.stalled.set(!0)},Hr)}}close(){this.#r(),this.#s.close()}static supported=ei},Gr=class{sync;broadcast;track;config;catalog;stats;timestamp=new u(void 0);frame=new u(void 0);buffered=new u([]);#t=new u([]);#e=0;#n=new T;constructor(t){this.sync=t.sync,this.broadcast=t.broadcast,this.track=t.track,this.config=t.config,this.catalog=t.catalog,this.stats=t.stats,this.#n.run(this.#i.bind(this))}#i(t){let e=Pt(t,{broadcast:this.broadcast,track:this.track,priority:vt.video,maxAge:this.sync.out.maxAge});if(!e)return;let i=new VideoDecoder({output:async n=>{try{let s=this.#e,r=f.fromMicro(n.timestamp);if(r<(this.timestamp.peek()??0)||this.sync.out.reference.peek()===void 0||(this.frame.peek()===void 0&&this.frame.set(n.clone()),!await t.race(this.sync.wait(r).then(()=>!0)))||s!==this.#e||r<(this.timestamp.peek()??0))return;this.timestamp.set(r),this.#c(r),this.frame.update(a=>(a?.close(),n.clone()))}finally{n.close()}},error:n=>{console.error("video decoder error",n),t.close()}});t.cleanup(()=>{i.state!=="closed"&&i.close()}),this.config.container.kind==="cmaf"?this.#r(t,e,i):this.#s(t,e,i)}#s(t,e,i){let n=this.config.container.kind==="loc"?new jt("video"):new Nt(this.config),s=new pt(e,{format:n,maxAge:this.sync.out.maxAge});t.cleanup(()=>s.close()),t.run(o=>{let c=o.get(s.buffered),l=o.get(this.#t);this.buffered.update(()=>mt(c,l))}),i.configure({codec:this.config.codec,description:this.config.description?U(this.config.description):void 0,displayAspectWidth:this.config.displayAspectWidth,displayAspectHeight:this.config.displayAspectHeight,optimizeForLatency:this.config.optimizeForLatency,flip:!1});let r,a;t.spawn(async()=>{for(;;){let o=await bt(s);if(!o)break;this.#a(o.discontinuity)&&(r=void 0);let{frame:c}=o;if(!c)continue;let l=a!==void 0&&o.group<a;if(this.stats.update(p=>({frameCount:(p?.frameCount??0)+ +!l,bytesReceived:(p?.bytesReceived??0)+c.payload.byteLength})),l)continue;let h=f.fromMicro(c.timestamp);this.sync.received(h,"video");let d=new EncodedVideoChunk({type:c.keyframe?"key":"delta",data:c.payload,timestamp:c.timestamp});r!==void 0&&o.continuous&&this.#o(f.fromMicro(r),f.fromMicro(c.timestamp)),r=c.timestamp,a=o.group,i.decode(d)}})}#r(t,e,i){let n=this.config.container;if(n.kind!=="cmaf")return;let s=lt(n.init),r=At(s),a=this.config.description?U(this.config.description):r.description,o=new pt(e,{format:new ze(r),maxAge:this.sync.out.maxAge});t.cleanup(()=>o.close()),t.run(h=>{let d=h.get(o.buffered),p=h.get(this.#t);this.buffered.update(()=>mt(d,p))}),i.configure({codec:this.config.codec,description:a,displayAspectWidth:this.config.displayAspectWidth,displayAspectHeight:this.config.displayAspectHeight,optimizeForLatency:this.config.optimizeForLatency,flip:!1});let c,l;t.spawn(async()=>{for(;;){let h=await bt(o);if(!h)break;this.#a(h.discontinuity)&&(c=void 0);let{frame:d}=h;if(!d)continue;let p=l!==void 0&&h.group<l;if(this.stats.update(v=>({frameCount:(v?.frameCount??0)+ +!p,bytesReceived:(v?.bytesReceived??0)+d.payload.byteLength})),p)continue;let g=f.fromMicro(d.timestamp);if(this.sync.received(g,"video"),c!==void 0&&h.continuous&&this.#o(f.fromMicro(c),f.fromMicro(d.timestamp)),c=d.timestamp,i.state==="closed")break;l=h.group,i.decode(new EncodedVideoChunk({type:d.keyframe?"key":"delta",data:d.payload,timestamp:d.timestamp}))}})}#a(t){return t!==this.#e&&(this.#e=t,this.timestamp.set(void 0),this.#t.set([]),this.sync.reset(),!0)}#o(t,e){t>e||this.#t.mutate(i=>{for(let n of i)if(n.start<=e&&n.end>=t){n.start=f.min(n.start,t),n.end=f.max(n.end,e);return}i.push({start:t,end:e}),i.sort((n,s)=>n.start-s.start)})}#c(t){this.#t.mutate(e=>{for(;e.length>0;){if(e[0].end>=t){e[0].start=f.max(e[0].start,t);break}e.shift()}})}close(){this.#n.close(),this.frame.update(t=>{t?.close()})}};async function ei(t){if(!Se(t.container)){let n=t.container.kind==="unknown"?t.container.raw.kind:t.container.kind;return console.warn(`video: ignoring rendition with unknown container: ${n}`),!1}let e;if(t.description)e=U(t.description);else if(t.container.kind==="cmaf")try{e=At(lt(t.container.init)).description}catch(n){return console.warn(`video: malformed CMAF init segment for codec ${t.codec}`,n),!1}let{supported:i}=await VideoDecoder.isConfigSupported({codec:t.codec,description:e,displayAspectWidth:t.displayAspectWidth,displayAspectHeight:t.displayAspectHeight,optimizeForLatency:t.optimizeForLatency??!0});if(i)return!0;if(t.codec.startsWith("avc3.")){let n=`avc1.${t.codec.slice(5)}`;if((await VideoDecoder.isConfigSupported({codec:n,description:e,displayAspectWidth:t.displayAspectWidth,displayAspectHeight:t.displayAspectHeight,optimizeForLatency:t.optimizeForLatency??!0})).supported)return t.codec=n,!0}return!1}Object.assign(ei,{[Xe]:Dr});var ve=.01,Vr=class{decoder;in;#t={frame:new u(void 0),timestamp:new u(void 0),visible:new u(!1)};out=_(this.#t);#e=new u(void 0);#n=new T;constructor(t){this.decoder=t.decoder,this.in={canvas:b(t?.canvas),visible:b(t?.visible??"20%")},this.#n.run(e=>{let i=e.get(this.in.canvas);this.#e.set(i?.getContext("2d")??void 0)}),this.#n.run(this.#s.bind(this)),this.#n.run(this.#r.bind(this)),this.#n.run(this.#i.bind(this))}#i(t){let e=t.getAll([this.in.canvas,this.decoder.out.display]);if(!e)return;let[i,n]=e;(i.width!==n.width||i.height!==n.height)&&(i.width=n.width,i.height=n.height)}#s(t){let e=t.get(this.in.visible);if(e==="never"){this.#t.visible.set(!1);return}if(e==="always"){this.#t.visible.set(!0),t.cleanup(()=>this.#t.visible.set(!1));return}let i=t.get(this.in.canvas);if(!i){this.#t.visible.set(!1);return}let n=!1,s=()=>{this.#t.visible.set(n&&!document.hidden)},r=o=>{for(let c of o)n=c.isIntersecting,s()},a;try{a=new IntersectionObserver(r,{threshold:ve,rootMargin:e})}catch{console.warn(`moq-watch: invalid visible margin "${e}", using "0px"`),a=new IntersectionObserver(r,{threshold:ve})}s(),t.event(document,"visibilitychange",s),a.observe(i),t.cleanup(()=>a.disconnect()),t.cleanup(()=>this.#t.visible.set(!1))}#r(t){let e=t.get(this.#e);if(!e)return;let i=t.get(this.decoder.out.frame),n=t.get(this.decoder.source.out.catalog),s=requestAnimationFrame(()=>{this.#a(e,i,n),i?(this.#t.frame.update(r=>(r?.close(),i.clone())),this.#t.timestamp.set(f.fromMicro(i.timestamp))):(this.#t.frame.update(r=>{r?.close()}),this.#t.timestamp.set(void 0)),s=void 0});t.cleanup(()=>{s!==void 0&&cancelAnimationFrame(s)})}#a(t,e,i){if(!e){t.fillStyle="#000",t.fillRect(0,0,t.canvas.width,t.canvas.height);return}if(t.save(),t.fillStyle="#000",t.fillRect(0,0,t.canvas.width,t.canvas.height),!i?.rotation)i?.flip&&(t.scale(-1,1),t.translate(-t.canvas.width,0)),t.drawImage(e,0,0,t.canvas.width,t.canvas.height);else{let n=qr(t.canvas,i);t.setTransform(...n.matrix),t.drawImage(e,0,0,n.source.width,n.source.height)}t.restore()}close(){this.#t.frame.update(t=>{t?.close()}),this.#t.timestamp.set(void 0),this.#n.close()}};function Yr(t){return e=>{let i=[],n=[];for(let[s,r]of e)if(r.codedWidth&&r.codedHeight){let a=r.codedWidth*r.codedHeight;a<=t?i.push({name:s,size:a}):n.push({name:s,size:a})}return i.sort((s,r)=>r.size-s.size),i.length>0?i.map(s=>s.name):n.length>0?(n.sort((s,r)=>s.size-r.size),[n[0].name]):e.map(([s])=>s)}}function ii(t,e){return i=>{let n=[],s=[];for(let[r,a]of i){if(!a.codedWidth||!a.codedHeight)continue;let o=a.codedWidth*a.codedHeight,c=t==null||a.codedWidth<=t,l=e==null||a.codedHeight<=e;c&&l?n.push({name:r,size:o}):s.push({name:r,size:o})}return n.sort((r,a)=>a.size-r.size),n.length>0?n.map(r=>r.name):s.length>0?(s.sort((r,a)=>r.size-a.size),[s[0].name]):i.map(([r])=>r)}}function ni(t){return e=>{let i=[],n=[];for(let[s,r]of e)r.bitrate!=null&&r.bitrate<=t?i.push({name:s,bitrate:r.bitrate}):r.bitrate!=null&&n.push({name:s,bitrate:r.bitrate});return i.sort((s,r)=>r.bitrate-s.bitrate),i.length>0?i.map(s=>s.name):n.length>0?(n.sort((s,r)=>s.bitrate-r.bitrate),[n[0].name]):e.map(([s])=>s)}}function Kr(t){let e=t[0];for(let i of t){let[,n]=i,[,s]=e,r=(n.codedWidth??0)*(n.codedHeight??0),a=(s.codedWidth??0)*(s.codedHeight??0);if(r!==a){r>a&&(e=i);continue}(n.bitrate??0)>(s.bitrate??0)&&(e=i)}return e[0]}function Jr(t){let e=Object.entries(t).filter(([,r])=>!r.stalled);if(e.length>0)return Object.fromEntries(e);let i=Object.entries(t);if(i.length===0)return{};let n=ni(0)(i),s=n.length===1?n[0]:ii(0,0)(i)[0];return{[s]:t[s]}}var Xr=class{in;#t={catalog:new u(void 0),available:new u({}),error:new u(void 0),track:new u(void 0),config:new u(void 0)};out=_(this.#t);#e=new T;#n=new WeakMap;constructor(t){this.in={broadcast:b(t?.broadcast),target:b(t?.target),supported:b(t?.supported),probe:b(t?.probe)},this.#e.run(this.#i.bind(this)),this.#e.run(this.#s.bind(this)),this.#e.run(this.#r.bind(this))}#i(t){let e=t.get(this.in.broadcast);if(!e)return;let i=t.get(e.out.catalog)?.video;i&&t.set(this.#t.catalog,i)}#s(t){let e=t.get(this.in.supported);if(!e){this.#t.error.set(void 0);return}let i=t.get(this.#t.catalog)?.renditions??{};this.#t.error.set(void 0);let n=this.#n.get(e);n||(n=new Map,this.#n.set(e,n));let s=new Set(Object.keys(i));for(let r of n.keys())s.has(r)||n.delete(r);t.spawn(async()=>{let r={};for(let[o,c]of Object.entries(i)){let l=e[Xe],h=l?l(c):JSON.stringify(c),d=n.get(o),p=!1;if(d?.key===h)p=d.supported;else{let g=!1;try{p=await t.race(e(c))}catch(v){g=!0,console.warn(`[Source] video rendition ${o} (${c.codec}) support probe failed; treating as unsupported`,v)}!g&&p!==void 0&&n.set(o,{key:l?l(c):JSON.stringify(c),supported:p})}if(t.abort.aborted)return;p&&(r[o]=c)}let a=Object.keys(r).length===0&&Object.keys(i).length>0?"unsupported":void 0;a==="unsupported"&&console.warn("[Source] No supported video renditions found:",i),this.#t.error.set(a),this.#t.available.set(r)})}#r(t){let e=t.get(this.#t.available),i=t.get(this.in.target);if(i?.name&&i.name in e){let o=e[i.name];t.set(this.#t.track,i.name),t.set(this.#t.config,o);return}let n=Jr(e);if(Object.keys(n).length===0)return;let s=i;if(!i?.bitrate){let o=t.get(this.in.probe)?.estimatedRecvRate;if(o!=null){let c=Math.round(o*.8);s={...i,bitrate:c}}}let r=this.#a(n,s);if(!r)return;let a=n[r];t.set(this.#t.track,r),t.set(this.#t.config,a)}#a(t,e){let i=Object.entries(t);if(i.length===0)return;if(i.length===1)return i[0][0];let n=[];if(e?.pixels!=null&&n.push(Yr(e.pixels)),(e?.width!=null||e?.height!=null)&&n.push(ii(e.width,e.height)),e?.bitrate!=null&&n.push(ni(e.bitrate)),n.length===0)return Kr(i);let s=n.map(a=>a(i)),r=s.map(a=>new Set(a));for(let a of s[0])if(r.every(o=>o.has(a)))return a;console.warn("conflicting rendition filters, no rendition satisfies all criteria")}close(){this.#e.close()}},Zr=class{in;broadcast;sync;text;video;audio;renderer;emitter;textRenderer;#t=new u(!1);#e=new u(!1);#n=new u(!1);#i=new T;constructor(t={}){this.in=_({origin:b(t.origin),name:b(t.name??zt()),enabled:b(t.enabled??!0),announced:b(t.announced??!0),catalogFormat:b(t.catalogFormat),catalog:b(t.catalog),probe:b(t.probe),canvas:b(t.canvas),container:b(t.container),paused:b(t.paused??!1),volume:b(t.volume??.5),muted:b(t.muted??!1),visible:b(t.visible??"20%"),delay:b(t.delay??"auto"),buffer:b(t.buffer??f.zero),target:b(t.target),captions:b(t.captions)}),this.broadcast=new Sr(this.in),this.#i.cleanup(()=>this.broadcast.close());let e=new Xr({broadcast:this.broadcast,target:this.in.target,supported:we.supported,probe:this.in.probe}),i=new gr({broadcast:this.broadcast,supported:fe.supported});this.#i.cleanup(()=>{e.close(),i.close()}),this.text=new jr({broadcast:this.broadcast,target:this.in.captions}),this.#i.cleanup(()=>this.text.close()),this.sync=new Er({delay:this.in.delay,buffer:this.in.buffer,probe:this.in.probe}),this.#i.cleanup(()=>this.sync.close()),this.video=new we({source:e,sync:this.sync,enabled:this.#t}),this.audio=new fe({source:i,sync:this.sync,enabled:this.#e}),this.#i.cleanup(()=>{this.video.close(),this.audio.close()}),this.emitter=new mr({source:this.audio,volume:this.in.volume,muted:this.in.muted,paused:this.in.paused}),this.renderer=new Vr({decoder:this.video,canvas:this.in.canvas,visible:this.in.visible}),this.#i.cleanup(()=>{this.emitter.close(),this.renderer.close()}),this.textRenderer=new zr({source:this.text,sync:this.sync,container:this.in.container,enabled:this.#n}),this.#i.cleanup(()=>this.textRenderer.close()),this.#i.run(n=>{this.#n.set(n.get(this.in.enabled)&&!n.get(this.in.paused))}),this.#i.run(n=>{this.#e.set(n.get(this.in.enabled)&&n.get(this.emitter.out.enabled))}),this.#i.run(n=>{let s=n.get(this.renderer.out.visible);n.get(this.in.enabled)?n.get(this.in.paused)?this.#t.set(s&&!n.get(this.renderer.out.frame)):this.#t.set(s):this.#t.set(!1)})}reset(){this.sync.reset(),this.audio.reset()}close(){this.#i.close()}};function si(t){let e=/^(\d+(?:\.\d+)?)(ms|s)?$/.exec(t.trim());if(!e)return;let i=Number.parseFloat(e[1]);if(Number.isFinite(i))return e[2]===void 0?i===0?f.zero:void 0:f(e[2]==="s"?i*1e3:i)}function Ae(t){return`${t}ms`}var Qr=["url","name","paused","volume","muted","visible","announced","delay","buffer","reload","latency","latency-min","jitter","catalog-format","captions"];function ta(t){let e=t?.trim();return e?e==="never"||e==="always"||/^-?\d+(\.\d+)?(px|%)$/.test(e)?e:/^-?\d+(\.\d+)?$/.test(e)?`${e}px`:(console.warn(`moq-watch: invalid visible="${t}", expected "never", "always", or a CSS length like "200px"`),"20%"):"20%"}function ea(t){let e=t?.trim();if(!e||e==="auto")return"auto";if(e==="instant")return"instant";let i=si(e);return i===void 0?(console.warn(`moq-watch: invalid delay="${t}", expected "auto", "instant", or a duration like "300ms"`),"auto"):i}function ia(t){let e=t?.trim();if(!e)return f.zero;let i=si(e);return i===void 0?(console.warn(`moq-watch: invalid buffer="${t}", expected a duration like "30s"`),f.zero):i}function ri(t){if(t!==null)return xr.find(e=>e===t)}function Et(t,e){if(t===null)return e;let i=t.trim().toLowerCase();return i!=="false"&&i!=="0"}var na=new FinalizationRegistry(t=>t.close()),ai=class extends HTMLElement{static observedAttributes=Qr;connection;player;broadcast;video;audio;renderer;emitter;text;textRenderer;sync;controls={paused:new u(!1),volume:new u(.5),muted:new u(!1),visible:new u("20%"),delay:new u("auto"),buffer:new u(f.zero),target:new u(void 0),captions:new u(void 0)};#t=new u(zt());#e=new u(!0);#n=new u(void 0);#i=new u(void 0);#s=new u(void 0);#r=new u(void 0);#a;#o=new u(!1);#c=.5;signals=new T;constructor(){super(),na.register(this,this.signals),this.connection=new Ei({enabled:this.#o}),this.signals.cleanup(()=>this.connection.close()),this.player=new Zr({origin:this.connection.origin,probe:this.connection.probe,enabled:this.#o,name:this.#t,announced:this.#e,catalogFormat:this.#n,catalog:this.#i,canvas:this.#s,container:this.#r,...this.controls}),this.signals.cleanup(()=>this.player.close()),this.broadcast=this.player.broadcast,this.video=this.player.video,this.audio=this.player.audio,this.renderer=this.player.renderer,this.emitter=this.player.emitter,this.text=this.player.text,this.textRenderer=this.player.textRenderer,this.sync=this.player.sync,this.signals.run(r=>{r.get(this.controls.muted)?(this.#c=this.controls.volume.peek()||.5,this.controls.volume.set(0)):this.controls.volume.set(this.#c)}),this.signals.run(r=>{let a=r.get(this.controls.volume);this.controls.muted.set(a===0)});let t=()=>{let r=this.querySelector("canvas")??void 0;!r&&this.querySelector("video")&&console.warn("moq-watch: rendering requires a <canvas> child; a <video> child does nothing."),this.#s.set(r)},e=new MutationObserver(t);e.observe(this,{childList:!0,subtree:!0}),this.signals.cleanup(()=>e.disconnect()),t(),this.signals.run(r=>{let a=r.get(this.connection.url);a?this.setAttribute("url",a.toString()):this.removeAttribute("url")}),this.signals.run(r=>{let a=r.get(this.#t);this.setAttribute("name",a.toString())}),this.signals.run(r=>{r.get(this.controls.muted)?this.setAttribute("muted",""):this.removeAttribute("muted")}),this.signals.run(r=>{r.get(this.controls.paused)?this.setAttribute("paused",""):this.removeAttribute("paused")}),this.signals.run(r=>{let a=r.get(this.controls.volume);this.setAttribute("volume",a.toString())}),this.signals.run(r=>{let a=r.get(this.controls.visible);this.setAttribute("visible",a)}),this.signals.run(r=>{let a=r.get(this.controls.delay);this.setAttribute("delay",typeof a=="number"?Ae(a):a)}),this.signals.run(r=>{this.setAttribute("buffer",Ae(r.get(this.controls.buffer)))});let i=(r,a)=>{if(r<=0||a<=0)return;let o=window.devicePixelRatio||1;this.controls.target.update(c=>({...c,width:Math.round(r*o),height:Math.round(a*o)}))},n=new ResizeObserver(r=>{let a=r[0];a&&i(a.contentRect.width,a.contentRect.height)});n.observe(this),this.signals.cleanup(()=>n.disconnect());let s=this.getBoundingClientRect();i(s.width,s.height)}connectedCallback(){if(this.#o.set(!0),this.style.display="block",this.style.position="relative",!this.#a){let t=document.createElement("div");t.style.position="absolute",t.style.inset="0",t.style.pointerEvents="none",t.style.zIndex="1",this.appendChild(t),this.#a=t,this.#r.set(t)}}disconnectedCallback(){this.#o.set(!1)}attributeChangedCallback(t,e,i){if(e!==i)if(t==="url")this.connection.url.set(i?new URL(i):void 0);else if(t==="name")this.#t.set(Wt(i??""));else if(t==="paused")this.controls.paused.set(Et(i,!1));else if(t==="volume"){let n=i?Number.parseFloat(i):.5;this.controls.volume.set(n)}else if(t==="muted")this.controls.muted.set(Et(i,!1));else if(t==="visible")this.controls.visible.set(ta(i));else if(t==="announced")this.#e.set(Et(i,!0));else if(t==="delay")this.controls.delay.set(ea(i));else if(t==="buffer")this.controls.buffer.set(ia(i));else if(t==="reload")console.warn("moq-watch: `reload` was renamed to `announced`");else if(t==="latency"||t==="latency-min"||t==="jitter")console.warn(`moq-watch: \`${t}\` is gone; use \`delay\` and \`buffer\``);else if(t==="catalog-format")this.#n.set(ri(i));else if(t==="captions")this.controls.captions.set(i||void 0);else throw Error(`Invalid attribute: ${t}`)}get url(){return this.connection.url.peek()}set url(t){this.connection.url.set(t?new URL(t):void 0)}get name(){return this.#t.peek()}set name(t){this.#t.set(Wt(t))}get paused(){return this.controls.paused.peek()}set paused(t){this.controls.paused.set(t)}get volume(){return this.controls.volume.peek()}set volume(t){this.controls.volume.set(t)}get muted(){return this.controls.muted.peek()}set muted(t){this.controls.muted.set(t)}get visible(){return this.controls.visible.peek()}set visible(t){this.controls.visible.set(t)}get announced(){return this.#e.peek()}set announced(t){this.#e.set(t)}set reload(t){throw Error("moq-watch: `reload` was renamed to `announced`")}get delay(){return this.controls.delay.peek()}set delay(t){this.controls.delay.set(t)}get buffer(){return this.controls.buffer.peek()}set buffer(t){this.controls.buffer.set(t)}get latency(){return this.controls.delay.peek()}set latency(t){throw Error("moq-watch: `latency` is gone; use `delay` and `buffer`")}get latencyMin(){return this.controls.delay.peek()}set latencyMin(t){throw Error("moq-watch: `latencyMin` is gone; use `delay` and `buffer`")}set latencyMax(t){throw Error("moq-watch: `latencyMax` is gone. Use `buffer`, the media held beyond the live edge; the old ceiling included the floor, so it is `latencyMax - delay`.")}get jitter(){return this.sync.out.jitter.peek()}set jitter(t){throw Error("moq-watch: `jitter` is a readout; set `delay` instead")}reset(){this.player.reset()}get catalogFormat(){return this.#n.peek()}set catalogFormat(t){this.#n.set(t)}get catalog(){return this.broadcast.out.catalog.peek()}set catalog(t){this.#i.set(t)}get captions(){return this.controls.captions.peek()}set captions(t){this.controls.captions.set(t||void 0)}};customElements.define("moq-watch",ai);const da=Object.freeze(Object.defineProperty({__proto__:null,default:ai,parseCatalogFormat:ri},Symbol.toStringTag,{value:"Module"}));export{ha as P,je as V,Be as a,Ne as b,la as c,da as e,gt as p};
