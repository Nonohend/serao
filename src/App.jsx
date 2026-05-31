import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { supabase, SITE_URL, withTimeout } from './lib/supabase';

/* ─ STORAGE (legacy — being migrated to Supabase) ─ */
const ls={
  get:(k,d)=>{try{const v=localStorage.getItem('serao_'+k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem('serao_'+k,JSON.stringify(v));}catch{}},
};

/* ─ Map a Supabase product row into the shape our components expect ─ */
const mapProductRow = (r) => ({
  id: r.id,
  nom: r.nom,
  prix: Number(r.prix) || 0,
  note: Number(r.note) || 5.0,
  emoji: r.emoji,
  img: r.image_url,
  badge: r.badge,
  cat: r.category?.nom || r.cat || '',
  region: r.region || '',
  deliv: r.deliv || '3-5 jours',
  vendeur_id: r.vendeur_id,
  description: r.description,
  stock: r.stock,
});

/* ─ HELPERS ─ */
const fmt=n=>n.toLocaleString('fr-FR').replace(/\u202f/g,' ').replace(/,/g,' ')+' Ar';
const fmtT=iso=>{const d=new Date(iso);return d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});};
const fmtD=iso=>{const d=new Date(iso),t=new Date(),diff=(t-d)/86400000;if(diff<1)return'Aujourd\'hui';if(diff<2)return'Hier';return d.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});};
const initials=n=>n.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
const avColor=n=>{const c=['linear-gradient(135deg,rgba(20,123,99,0.4),rgba(6,214,176,0.2))','linear-gradient(135deg,rgba(245,159,10,0.4),rgba(251,191,36,0.2))','linear-gradient(135deg,rgba(96,165,250,0.4),rgba(147,197,253,0.2))','linear-gradient(135deg,rgba(139,92,246,0.4),rgba(167,139,250,0.2))'];let h=0;for(let i=0;i<n.length;i++)h+=n.charCodeAt(i);return c[h%c.length];};

/* ─ DATA ─ */
const PUB_CHANNELS=[{id:'general',name:'# Général',icon:'💬',desc:'Discussion générale'},{id:'annonces',name:'# Annonces',icon:'📢',desc:'Officiel'},{id:'vanille',name:'# Vanille',icon:'🫛',desc:'Produits vanille'},{id:'artisanat',name:'# Artisanat',icon:'🎨',desc:'Artisanat'},{id:'marche',name:'# Marché',icon:'🛍️',desc:'Achats & ventes'}];
const DEF_ARTICLES=[{id:1,min:8,date:'2026-02-15',auteur:'Ravo Andriamahefa',titre:'Top 10 des produits artisanaux malagasy',extrait:"Découvrez les trésors de l'artisanat malgache, des sculptures en palissandre aux tissages en soie sauvage.",tags:['artisanat','guide','culture'],publie:true},{id:2,min:6,date:'2026-02-10',auteur:'Nirina Rakoto',titre:'Pourquoi la vanille de Madagascar est unique',extrait:"La vanille bourbon de Madagascar représente 80% de la production mondiale. Découvrez ce qui la rend si spéciale.",tags:['vanille','agriculture'],publie:true},{id:3,min:5,date:'2026-01-28',auteur:'Fanja Rasoa',titre:'Produits naturels malagasy pour la peau',extrait:"Huile de baobab, beurre de karité... Les secrets beauté de Madagascar.",tags:['cosmétiques','beauté','naturel'],publie:true},{id:4,min:7,date:'2026-01-20',auteur:'Hery Rajoelina',titre:"Reconnaître un artisanat authentique",extrait:"Les clés pour distinguer les véritables créations artisanales des imitations industrielles.",tags:['artisanat','guide'],publie:true}];
const CATS=[{emoji:'🫛',nom:'Vanille',count:5},{emoji:'🎨',nom:'Artisanat',count:4},{emoji:'🌶️',nom:'Épices',count:3},{emoji:'🧴',nom:'Cosmétiques',count:3},{emoji:'🧵',nom:'Textiles',count:3},{emoji:'💎',nom:'Bijoux',count:2}];
const WHY=[{icon:'🛡️',t:'Authenticité garantie',b:'Chaque produit vérifié par nos experts et notre IA avancée.'},{icon:'🚀',t:'Livraison ultra-rapide',b:'SERAO Delivery : domicile, point relais ou retrait vendeur.'},{icon:'🌿',t:'Impact local direct',b:"Soutenez directement les artisans et producteurs malagasy."}];
const VENDORS_D=[{emoji:'🌿',nom:'Vanille de Sava',ville:'SAVA',note:4.9,nb:5},{emoji:'🎭',nom:'Atelier Zafindraony',ville:'Antananarivo',note:4.7,nb:4},{emoji:'🌺',nom:'Ravinala Cosmetics',ville:'Toamasina',note:4.8,nb:3}];

/* ─ COMPONENTS ─ */
const StarSVG=()=><svg width="12" height="12" viewBox="0 0 24 24" fill="#1aff9c" stroke="#1aff9c" strokeWidth="1"><polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/></svg>;
const SendSVG=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;

function Badge({kind}){
  const m={top:['b-top','Top vendeur'],spons:['b-spons','Sponsorisé'],new:['b-new','Nouveau'],verif:['b-verif','✓ Vérifié']};
  const[cls,txt]=(m[kind]||m.top);return <span className={'badge '+cls}>{txt}</span>;
}
function Btn({v='primary',sm,children,onClick,type='button',disabled,style}){
  return <button type={type} className={`btn btn-${v}${sm?' btn-sm':''}`} onClick={onClick} disabled={disabled} style={style}>{children}</button>;
}
function ProdCard({p,onBuy}){
  const[err,setErr]=useState(false);
  return(
    <article className="pcard" onClick={onBuy}>
      <div className="pcard-img">
        {p.img&&!err?<img src={p.img} alt={p.nom} className="pcard-photo" loading="lazy" onError={()=>setErr(true)}/>:<div className="pcard-emo">{p.emoji}</div>}
        <div className="glass-rating"><StarSVG/> {p.note.toFixed(1)}</div>
        {p.badge&&<div className="pcard-badge-pos"><Badge kind={p.badge}/></div>}
      </div>
      <div className="pcard-body">
        <div className="pcard-meta">{p.cat} · {p.region}</div>
        <div className="pcard-name">{p.nom}</div>
        <div className="pcard-foot">
          <span className="pcard-price">{fmt(p.prix)}</span>
          <button className="pcard-buy" onClick={e=>{e.stopPropagation();onBuy(p);}}>+</button>
        </div>
        <div className="pcard-deliv" style={{fontSize:'13px',color:'var(--muted)',marginTop:'6px'}}>🚚 {p.deliv}</div>
      </div>
      <div className="pcard-glow"/>
    </article>
  );
}

/* ─ PAYMENT MODAL ─ */
function PaymentModal({product, onClose, showToast, user}){
  const[method,setMethod]=useState('');
  const[phone,setPhone]=useState('');
  const[status,setStatus]=useState('select'); // select | processing | success
  const[orderId,setOrderId]=useState(null);
  const[rated,setRated]=useState(0);
  const methods=[{id:'mvola',icon:'📱',name:'MVola',color:'#E30913'},{id:'orange',icon:'🟠',name:'Orange Money',color:'#FF6600'},{id:'airtel',icon:'❤️',name:'Airtel Money',color:'#FF0000'}];
  const pay=async()=>{
    if(!method||!phone){showToast('Sélectionnez un moyen de paiement et entrez votre numéro','err');return;}
    setStatus('processing');
    // Simulate the Mobile Money gateway delay, then create the order via the
    // server-side RPC. The amount is recomputed from the product price in the
    // database, so a tampered client can never spoof the price (cf. S4).
    setTimeout(async()=>{
      try{
        const{data,error}=await supabase.rpc('create_order',{p_product_id:product?.id,p_pay_method:method});
        if(error){console.warn('order create failed',error);showToast('Erreur enregistrement commande : '+error.message,'err');setStatus('select');return;}
        setOrderId(data?.id);
        setStatus('success');
      }catch(ex){console.warn(ex);showToast('Erreur réseau, réessaie','err');setStatus('select');}
    },2200);
  };
  // Quick post-purchase rating — feeds the real products.note average (cf. reviews table).
  const rate=async(n)=>{
    setRated(n);
    try{await supabase.from('reviews').upsert({product_id:product?.id,auteur_id:user?.id,note:n},{onConflict:'product_id,auteur_id'});}
    catch(ex){console.warn('review failed',ex);}
  };
  return(
    <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div className="modal">
        {status==='select'&&<>
          <div className="modal-title">💳 Paiement Mobile Money</div>
          <div className="pay-amount-display">
            <div className="pay-amount-val">{fmt(product?.prix||0)}</div>
            <div className="pay-amount-cur">Montant à payer · {product?.nom}</div>
          </div>
          <div style={{marginBottom:'16px'}}>
            <div className="fl">Choisir le moyen de paiement</div>
            <div className="pay-methods">
              {methods.map(m=>(
                <div key={m.id} className={'pay-method'+(method===m.id?' on':'')} onClick={()=>setMethod(m.id)}>
                  <div className="pay-method-icon">{m.icon}</div>
                  <div className="pay-method-name">{m.name}</div>
                  <div className="pay-method-color" style={{color:m.color,fontWeight:700,fontSize:'12px'}}>●</div>
                </div>
              ))}
            </div>
          </div>
          <div className="fg"><label className="fl">Numéro Mobile Money</label><input className="fi" placeholder="+261 34 00 000 00" value={phone} onChange={e=>setPhone(e.target.value)}/></div>
          <div style={{padding:'14px',background:'rgba(20,123,99,0.1)',border:'1px solid rgba(20,123,99,0.2)',borderRadius:'var(--r-md)',marginBottom:'20px',fontSize:'13px',color:'var(--muted)'}}>
            📲 Vous recevrez une demande de confirmation sur votre téléphone. Commission SERAO : 3%.
          </div>
          <div className="modal-foot">
            <Btn v="glass" onClick={onClose}>Annuler</Btn>
            <Btn onClick={pay}>Confirmer le paiement</Btn>
          </div>
        </>}
        {status==='processing'&&(
          <div className="pay-progress">
            <div className="pay-spinner"/>
            <div style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:700,color:'var(--text)',marginBottom:'8px'}}>Traitement en cours...</div>
            <div style={{color:'var(--muted)',fontSize:'14px'}}>En attente de confirmation {method==='mvola'?'MVola':method==='orange'?'Orange Money':'Airtel Money'}</div>
            <div style={{marginTop:'24px',padding:'16px',background:'var(--glass-emerald)',borderRadius:'var(--r-lg)',fontSize:'13px'}}>✓ Vérification de la transaction · Chiffrement SSL 256-bit</div>
          </div>
        )}
        {status==='success'&&(
          <div className="pay-success">
            <div className="pay-success-icon">✅</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,color:'var(--emerald-glow)',marginBottom:'8px'}}>Paiement réussi !</div>
            <div style={{color:'var(--muted)',fontSize:'15px',marginBottom:'24px'}}>{product?.nom} · {fmt(product?.prix||0)}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',fontSize:'13px',marginBottom:'24px'}}>
              <div style={{padding:'12px',background:'var(--glass-1)',borderRadius:'var(--r-md)',textAlign:'center'}}><div style={{color:'var(--muted)',marginBottom:'4px'}}>Réf. commande</div><div style={{fontWeight:700,color:'var(--cyan-light)'}}>{orderId||'…'}</div></div>
              <div style={{padding:'12px',background:'var(--glass-1)',borderRadius:'var(--r-md)',textAlign:'center'}}><div style={{color:'var(--muted)',marginBottom:'4px'}}>Délai livraison</div><div style={{fontWeight:700,color:'var(--cyan-light)'}}>{product?.deliv}</div></div>
            </div>
            <div style={{marginBottom:'20px'}}>
              <div style={{color:'var(--muted)',fontSize:'13px',marginBottom:'8px'}}>Notez ce produit</div>
              <div style={{display:'flex',gap:'8px',justifyContent:'center',fontSize:'30px'}}>
                {[1,2,3,4,5].map(n=>(
                  <span key={n} onClick={()=>rate(n)} role="button" aria-label={`${n} étoile${n>1?'s':''}`} style={{cursor:'pointer',transition:'transform .15s',transform:n<=rated?'scale(1.1)':'none',filter:n<=rated?'none':'grayscale(1)',opacity:n<=rated?1:0.45}}>⭐</span>
                ))}
              </div>
              {rated>0&&<div style={{color:'var(--emerald-glow)',fontSize:'12px',marginTop:'8px'}}>Merci pour votre avis !</div>}
            </div>
            <Btn onClick={onClose} style={{width:'100%'}}>Retour au catalogue</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─ MAP TRACKING ─ */
function TrackingMap(){
  const mapRef=useRef(null);
  const mapInstance=useRef(null);
  const[step,setStep]=useState(3);
  const steps=[{l:'Commande confirmée',t:'08:00',icon:'📋'},{l:'Préparation',t:'09:30',icon:'📦'},{l:'Expédié',t:'11:00',icon:'🏭'},{l:'En route',t:'14:00',icon:'🚚'},{l:'Livré',t:'16:30',icon:'✅'}];

  useEffect(()=>{
    if(mapInstance.current) return;
    const map=L.map(mapRef.current,{zoomControl:false,attributionControl:false}).setView([-18.9137,47.5361],13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
    L.control.zoom({position:'bottomright'}).addTo(map);
    const sellerIcon=L.divIcon({html:'<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#147B63,#06D6B0);display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid rgba(255,255,255,0.3)">🏪</div>',iconSize:[36,36],className:''});
    const delivIcon=L.divIcon({html:'<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#F59F0A,#FBBF24);display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(255,255,255,0.3);animation:pulse 2s infinite;box-shadow:0 0 20px rgba(245,159,10,0.5)">🚚</div>',iconSize:[40,40],className:''});
    const destIcon=L.divIcon({html:'<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#fca5a5);display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid rgba(255,255,255,0.3)">📍</div>',iconSize:[36,36],className:''});
    L.marker([-18.910,47.530],{icon:sellerIcon}).addTo(map).bindPopup('<b>Vanille de Sava</b><br>Vendeur SERAO');
    L.marker([-18.905,47.533],{icon:delivIcon}).addTo(map).bindPopup('<b>Livreur SERAO</b><br>En route vers vous');
    L.marker([-18.900,47.538],{icon:destIcon}).addTo(map).bindPopup('<b>Destination</b><br>Antananarivo Centre');
    L.polyline([[-18.910,47.530],[-18.905,47.533],[-18.900,47.538]],{color:'#1aff9c',weight:3,dashArray:'8,6',opacity:0.7}).addTo(map);
    mapInstance.current=map;
    return()=>{map.remove();mapInstance.current=null;};
  },[]);

  return(<div>
    <div className="tracking-wrap"><div ref={mapRef} id="map"/></div>
    <div style={{display:'flex',gap:'12px',margin:'16px 0',flexWrap:'wrap'}}>
      {[{icon:'📦',l:'Poids',v:'1.2 kg'},{icon:'📏',l:'Distance',v:'3.2 km'},{icon:'⏱️',l:'ETA',v:'~45 min'},{icon:'🌡️',l:'Stockage',v:'Sec & frais'}].map((s,i)=>(
        <div key={i} style={{flex:1,minWidth:'100px',padding:'12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-lg)',textAlign:'center'}}>
          <div style={{fontSize:'20px',marginBottom:'4px'}}>{s.icon}</div>
          <div style={{fontSize:'12px',color:'var(--muted)'}}>{s.l}</div>
          <div style={{fontWeight:700,color:'var(--cyan-light)'}}>{s.v}</div>
        </div>
      ))}
    </div>
    <div className="tracking-timeline">
      {steps.map((s,i)=>(
        <div key={i} className="track-step" onClick={()=>setStep(i+1)} style={{cursor:'pointer'}}>
          <div className={'track-dot'+(i<step?' done':i===step?' current':' waiting')} style={{fontSize:'16px'}}>{i<step?'✓':s.icon}</div>
          <div className="track-info">
            <div className="track-label" style={{color:i<step?'var(--emerald-glow)':i===step?'var(--text)':'var(--muted)'}}>{s.l}</div>
            <div className="track-time">{s.t} — {i===step?'En cours':i<step?'Complété':'En attente'}</div>
          </div>
        </div>
      ))}
    </div>
  </div>);
}

/* ─ KYC FLOW ─ */
function KYCFlow({showToast}){
  const[step,setStep]=useState(0);
  const[role,setRole]=useState('vendeur');
  const[f,setF]=useState({nom:'',email:'',tel:'',region:'',desc:'',cin:'',selfie:false,doc:false});
  const set=(k,v)=>setF(ff=>({...ff,[k]:v}));
  const steps=['Rôle','Identité','Documents','Boutique','Confirmation'];

  const canNext=()=>{
    if(step===0) return role;
    if(step===1) return f.nom&&f.email&&f.tel;
    if(step===2) return f.doc;
    if(step===3) return f.desc;
    return true;
  };

  return(<div className="glass" style={{padding:'36px',maxWidth:'600px',margin:'0 auto'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
      <div style={{fontSize:'13px',fontWeight:600,color:'var(--muted)'}}>Étape {step+1} sur {steps.length} — {steps[step]}</div>
      <div style={{fontSize:'12px',color:'var(--emerald-glow)'}}>{Math.round((step/steps.length)*100)}%</div>
    </div>
    <div className="kyc-step-bar">{steps.map((s,i)=><div key={i} className={'kyc-step'+(i<step?' done':i===step?' current':'')}/>)}</div>

    {step===0&&(<div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'8px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Bienvenue sur SERAO</div>
      <div style={{color:'var(--muted)',fontSize:'14px',marginBottom:'24px'}}>Choisissez votre profil pour commencer</div>
      <div className="kyc-role-grid">
        {[{id:'acheteur',icon:'🛍️',name:'Acheteur',desc:'Je découvre et achète des produits malagasy authentiques'},{id:'vendeur',icon:'🏪',name:'Vendeur',desc:'Je vends mes créations et produits sur SERAO'}].map(r=>(
          <div key={r.id} className={'kyc-role'+(role===r.id?' on':'')} onClick={()=>setRole(r.id)}>
            <div className="kyc-role-icon">{r.icon}</div>
            <div style={{fontWeight:700,marginBottom:'4px'}}>{r.name}</div>
            <div style={{fontSize:'12px',color:'var(--muted)'}}>{r.desc}</div>
          </div>
        ))}
      </div>
    </div>)}

    {step===1&&(<div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'20px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Vos informations</div>
      <div className="fg"><label className="fl">Nom complet *</label><input className="fi" value={f.nom} onChange={e=>set('nom',e.target.value)} placeholder="Votre nom ou nom d'entreprise"/></div>
      <div className="fg"><label className="fl">Email *</label><input className="fi" type="email" value={f.email} onChange={e=>set('email',e.target.value)} placeholder="votre@email.com"/></div>
      <div className="fg"><label className="fl">Téléphone *</label><input className="fi" value={f.tel} onChange={e=>set('tel',e.target.value)} placeholder="+261 34 00 000 00"/></div>
      <div className="fg"><label className="fl">Région</label><select className="fi" value={f.region} onChange={e=>set('region',e.target.value)}><option value="">Choisir...</option>{['Antananarivo','SAVA','Toamasina','Fianarantsoa','Mahajanga','Nosy Be','Ilakaka'].map(r=><option key={r}>{r}</option>)}</select></div>
    </div>)}

    {step===2&&(<div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'8px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Vérification d'identité</div>
      <div style={{color:'var(--muted)',fontSize:'14px',marginBottom:'24px'}}>Requis pour la sécurité de la communauté SERAO</div>
      <div className="kyc-scan-anim" onClick={()=>set('doc',true)}>
        <div className="kyc-scan-line"/>
        {f.doc?'✅':'🪪'}
      </div>
      <div style={{textAlign:'center',marginBottom:'20px'}}>
        {f.doc?<div style={{color:'var(--emerald-glow)',fontWeight:600}}>✓ Document vérifié avec succès</div>:<div style={{color:'var(--muted)',fontSize:'13px'}}>Cliquez pour simuler l'upload de votre CIN/Passeport</div>}
      </div>
      <div className="kyc-upload-zone" onClick={()=>set('selfie',true)}>
        <div style={{fontSize:'40px',marginBottom:'10px'}}>{f.selfie?'✅':'🤳'}</div>
        <div style={{fontWeight:600,marginBottom:'4px'}}>{f.selfie?'Selfie vérifié !':'Prendre un selfie'}</div>
        <div style={{fontSize:'13px',color:'var(--muted)'}}>Vérification biométrique · Face API</div>
      </div>
    </div>)}

    {step===3&&(<div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'20px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Votre boutique</div>
      <div className="fg"><label className="fl">Description de vos produits *</label><textarea className="fi" rows="4" value={f.desc} onChange={e=>set('desc',e.target.value)} placeholder="Décrivez vos produits, leur origine, leur fabrication..."/></div>
      <div style={{padding:'16px',background:'var(--glass-emerald)',border:'1px solid rgba(20,123,99,0.3)',borderRadius:'var(--r-lg)',fontSize:'13px',color:'var(--muted)'}}>
        💰 <strong style={{color:'var(--emerald-glow)'}}>Inscription gratuite</strong> — Commission uniquement sur les ventes réalisées (3%)
      </div>
    </div>)}

    {step===4&&(<div style={{textAlign:'center',padding:'20px 0'}}>
      <div style={{fontSize:'64px',marginBottom:'16px',animation:'successPop .5s cubic-bezier(.23,1,.32,1)'}}>🎉</div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'26px',fontWeight:800,background:'linear-gradient(135deg,var(--emerald-glow),var(--cyan))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:'10px'}}>Bienvenue sur SERAO !</div>
      <div style={{color:'var(--muted)',fontSize:'15px',lineHeight:1.6,marginBottom:'24px'}}>Votre compte <strong style={{color:'var(--text)'}}>{f.nom||'vendeur'}</strong> est en cours de vérification.<br/>Vous recevrez une confirmation sous 24h.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',fontSize:'13px'}}>
        {['✅ Documents vérifiés','📧 Email envoyé','⏳ Validation admin'].map((s,i)=><div key={i} style={{padding:'12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-md)'}}>{s}</div>)}
      </div>
    </div>)}

    <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'28px',paddingTop:'20px',borderTop:'1px solid var(--glass-border)'}}>
      {step>0&&step<4&&<Btn v="glass" onClick={()=>setStep(s=>s-1)}>← Retour</Btn>}
      {step<4&&<Btn onClick={()=>{if(canNext())setStep(s=>s+1);else showToast('Remplissez les champs requis','err');}} disabled={!canNext()}>{step===3?'Soumettre →':'Continuer →'}</Btn>}
    </div>
  </div>);
}

/* ─ CHAT WINDOW ─ */
function ChatWindow({user,onClose}){
  const[active,setActive]=useState({type:'channel',id:'general',name:'# Général',sub:'Discussion générale'});
  const[msgs,setMsgs]=useState([]);
  const[users,setUsers]=useState([]);
  const[input,setInput]=useState('');
  const[search,setSearch]=useState('');
  const[sending,setSending]=useState(false);
  const bottomRef=useRef();
  const inputRef=useRef();

  // Initial load: profiles + messages
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const[p,m]=await Promise.all([
        supabase.from('profiles').select('id,nom,role'),
        supabase.from('messages').select('*').order('created_at',{ascending:true}).limit(500),
      ]);
      if(!mounted)return;
      setUsers(p.data||[]);
      setMsgs(m.data||[]);
    })();
    return()=>{mounted=false;};
  },[]);

  // Realtime subscription on messages table (INSERT + DELETE + UPDATE)
  useEffect(()=>{
    const ch=supabase
      .channel('serao-messages')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},payload=>{
        setMsgs(prev=>prev.some(m=>m.id===payload.new.id)?prev:[...prev,payload.new]);
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},payload=>{
        setMsgs(prev=>prev.filter(m=>m.id!==payload.old.id));
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages'},payload=>{
        setMsgs(prev=>prev.map(m=>m.id===payload.new.id?payload.new:m));
      })
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

  // Fallback poll every 5s in case Realtime is silently dropped (extension blocking WebSocket, etc.)
  useEffect(()=>{
    const id=setInterval(async()=>{
      const{data}=await supabase.from('messages').select('*').order('created_at',{ascending:true}).limit(500);
      if(data)setMsgs(data);
    },5000);
    return()=>clearInterval(id);
  },[]);

  // Message actions
  const[menuFor,setMenuFor]=useState(null); // message id whose menu is open
  const deleteMessage=async(m)=>{
    setMenuFor(null);
    if(!window.confirm('Supprimer ce message ?'))return;
    const{error}=await supabase.from('messages').delete().eq('id',m.id);
    if(error){console.warn(error);return;}
    // Optimistic remove (realtime will also remove it but this is instant)
    setMsgs(prev=>prev.filter(x=>x.id!==m.id));
  };
  const copyMessage=async(m)=>{
    setMenuFor(null);
    try{await navigator.clipboard.writeText(m.content);}catch{}
  };

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs,active]);

  // Filtering helpers (new schema: channel='general' OR DMs via from_user/to_user)
  const threadMsgs=msgs.filter(m=>{
    if(active.type==='channel')return m.channel===active.id;
    return(m.from_user===user.id&&m.to_user===active.id)||(m.from_user===active.id&&m.to_user===user.id);
  });
  const unread=(target)=>msgs.filter(m=>{
    if(target.type==='channel')return m.channel===target.id&&!(m.read_by||[]).includes(user.id);
    return m.from_user===target.id&&m.to_user===user.id&&!(m.read_by||[]).includes(user.id);
  }).length;
  const lastMsg=(id,type)=>{
    const ms=msgs.filter(m=>type==='channel'?m.channel===id:(m.from_user===id&&m.to_user===user.id)||(m.from_user===user.id&&m.to_user===id));
    const l=ms[ms.length-1];return l?l.content.slice(0,28)+(l.content.length>28?'...':''):'';
  };
  const send=async()=>{
    if(!input.trim()||sending)return;
    setSending(true);
    const text=input.trim();
    setInput('');
    const payload={
      from_user:user.id,
      content:text,
      ...(active.type==='channel'?{channel:active.id,to_user:null}:{to_user:active.id,channel:null}),
    };
    const{error}=await supabase.from('messages').insert(payload);
    if(error){console.warn('msg send error',error);setInput(text);}
    setSending(false);
    inputRef.current?.focus();
  };
  const selectConv=t=>{setActive(t);};
  const getUser=id=>users.find(u=>u.id===id)||{nom:'?',id};
  const channels=PUB_CHANNELS.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||!search);
  const dms=users.filter(u=>u.id!==user.id&&((u.nom||'').toLowerCase().includes(search.toLowerCase())||!search));
  const grouped=[];let lastDay='';
  threadMsgs.forEach(m=>{const ts=m.created_at||m.ts;const day=fmtD(ts);if(day!==lastDay){grouped.push({type:'sep',day});lastDay=day;}grouped.push({type:'msg',...m,_ts:ts,_from:m.from_user||m.from});});

  return(<div className="chat-win">
    <div className="chat-side">
      <div className="chat-side-head">
        <div className="chat-side-title">💬 Messages</div>
        <input className="chat-search" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      <div className="chat-side-body">
        {channels.length>0&&<div className="chat-sec-label">Salons</div>}
        {channels.map(c=>{const u=unread({type:'channel',id:c.id});return(
          <div key={c.id} className={'chat-item'+(active.type==='channel'&&active.id===c.id?' on':'')} onClick={()=>selectConv({type:'channel',id:c.id,name:c.name,sub:c.desc})}>
            <div className="ci-av" style={{background:'var(--glass-emerald)',fontSize:'18px'}}>{c.icon}</div>
            <div style={{flex:1,minWidth:0}}><div className="ci-name">{c.name}</div><div className="ci-prev">{lastMsg(c.id,'channel')||c.desc}</div></div>
            {u>0&&<div className="ci-badge">{u}</div>}
          </div>
        );})}
        {dms.length>0&&<div className="chat-sec-label">Privés</div>}
        {dms.map(u=>{const un=unread({type:'dm',id:u.id});return(
          <div key={u.id} className={'chat-item'+(active.type==='dm'&&active.id===u.id?' on':'')} onClick={()=>selectConv({type:'dm',id:u.id,name:u.nom,sub:u.role})}>
            <div style={{position:'relative'}}>
              <div className="ci-av" style={{background:avColor(u.nom)}}>{initials(u.nom)}</div>
              <div className="chat-online-dot"/>
            </div>
            <div style={{flex:1,minWidth:0}}><div className="ci-name">{u.nom}</div><div className="ci-prev">{lastMsg(u.id,'dm')||u.role}</div></div>
            {un>0&&<div className="ci-badge">{un}</div>}
          </div>
        );})}
      </div>
    </div>
    <div className="chat-main">
      <div className="chat-hdr">
        <div className="ci-av" style={{background:avColor(active.name),fontSize:active.type==='channel'?'18px':'14px'}}>{active.type==='channel'?(PUB_CHANNELS.find(c=>c.id===active.id)?.icon||'#'):initials(active.name)}</div>
        <div><div className="chat-hdr-name">{active.name}</div><div className="chat-hdr-sub">{active.sub}</div></div>
        <button onClick={onClose} style={{marginLeft:'auto',width:32,height:32,border:'none',background:'var(--glass-1)',borderRadius:'var(--r-sm)',cursor:'pointer',color:'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center'}}>✕</button>
      </div>
      <div className="chat-msgs">
        {grouped.length===0&&<div className="chat-empty"><div style={{fontSize:'48px'}}>💬</div><div style={{fontWeight:600,color:'var(--text)'}}>Démarrez la conversation</div><div style={{fontSize:'14px',color:'var(--muted)'}}>Bienvenue dans {active.name}</div></div>}
        {grouped.map((item,i)=>{
          if(item.type==='sep')return<div key={i} className="chat-date-sep"><span>{item.day}</span></div>;
          const sender=getUser(item._from);const mine=item._from===user.id;
          const menuOpen=menuFor===item.id;
          return(<div key={item.id} className={'msg-row msg-hover-host'+(mine?' mine':'')} style={{position:'relative'}}>
            {!mine&&<div className="msg-av" style={{background:avColor(sender.nom||'?')}}>{initials(sender.nom||'?')}</div>}
            <div className="msg-bubbles" style={{position:'relative'}}>
              {!mine&&active.type==='channel'&&<div className="msg-sender">{sender.nom||sender.email||'Anon'}</div>}
              <div style={{display:'flex',alignItems:'center',gap:'6px',flexDirection:mine?'row-reverse':'row'}}>
                <div className={'bubble '+(mine?'bubble-mine':'bubble-them')}>{item.content}</div>
                <button
                  className="msg-menu-btn"
                  onClick={()=>setMenuFor(menuOpen?null:item.id)}
                  aria-label="Options du message"
                  style={{border:'none',background:'transparent',color:'var(--muted)',cursor:'pointer',padding:'4px 6px',borderRadius:'50%',opacity:menuOpen?1:0.6,fontSize:'18px',lineHeight:1}}
                >⋯</button>
              </div>
              {menuOpen&&(
                <div
                  onMouseLeave={()=>setMenuFor(null)}
                  style={{position:'absolute',top:'100%',[mine?'right':'left']:0,marginTop:'6px',background:'rgba(10,18,28,0.98)',border:'1px solid var(--glass-border-hi)',borderRadius:'var(--r-md)',minWidth:'150px',zIndex:50,boxShadow:'var(--shadow-float)',overflow:'hidden',backdropFilter:'blur(20px)'}}
                >
                  <div onClick={()=>copyMessage(item)} style={{padding:'10px 14px',fontSize:'14px',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px',color:'var(--text)'}}>📋 Copier le texte</div>
                  {(mine||user?.role==='admin')&&(
                    <>
                      <div style={{height:'1px',background:'var(--glass-border)'}}/>
                      <div onClick={()=>deleteMessage(item)} style={{padding:'10px 14px',fontSize:'14px',cursor:'pointer',display:'flex',alignItems:'center',gap:'10px',color:'#fca5a5'}}>🗑️ Supprimer</div>
                    </>
                  )}
                </div>
              )}
              <div className="msg-time">{fmtT(item._ts)}{mine&&' ✓✓'}</div>
            </div>
          </div>);
        })}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-row">
        <textarea ref={inputRef} className="chat-input" placeholder={`Message ${active.name}...`} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} rows={1}/>
        <button className="chat-send" onClick={send} disabled={!input.trim()||sending}><SendSVG/></button>
      </div>
    </div>
  </div>);
}

/* ─ AUTH MODAL ─ */
function AuthModal({onAuth,onClose,user}){
  const[tab,setTab]=useState('login');
  const[role,setRole]=useState('acheteur');
  const[f,setF]=useState({nom:'',email:'',password:''});
  const[err,setErr]=useState('');
  const[info,setInfo]=useState('');
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>{setF(ff=>({...ff,[k]:v}));setErr('');setInfo('');};

  // Safety net: if the global auth listener sets `user` before our local await
  // chain finishes (e.g. SIGNED_IN event arrives first), close the modal.
  useEffect(()=>{if(user)onClose();},[user,onClose]);

  const submit=async e=>{
    e.preventDefault();setErr('');setInfo('');
    if(!f.email||!f.password){setErr('Email et mot de passe requis.');return;}
    setBusy(true);
    try{
      if(tab==='login'){
        const {data,error}=await withTimeout(
          supabase.auth.signInWithPassword({email:f.email.trim(),password:f.password}),
          20000,
          'Connexion'
        );
        if(error){
          if(error.message==='Invalid login credentials')setErr('Email ou mot de passe incorrect.');
          else if(error.message?.includes('Email not confirmed'))setErr('Email non confirmé. Clique sur "Mot de passe oublié ?" pour recevoir un nouveau lien.');
          else setErr(error.message);
          return;
        }
        // Profile fetch is non-blocking for the UI: the App-level
        // onAuthStateChange listener will load it and close this modal.
        onAuth(data.user);
      }else{
        if(!f.nom){setErr('Nom complet requis.');return;}
        if(f.password.length<6){setErr('Mot de passe : minimum 6 caractères.');return;}
        const {data,error}=await withTimeout(
          supabase.auth.signUp({
            email:f.email.trim(),
            password:f.password,
            options:{data:{nom:f.nom.trim(),role},emailRedirectTo: SITE_URL}
          }),
          20000,
          'Inscription'
        );
        if(error){setErr(error.message);return;}
        if(!data.session){setInfo('Compte créé ! Vérifie ta boîte mail pour confirmer ton email (le lien te renvoie sur le site).');return;}
        onAuth(data.user);
      }
    }catch(ex){
      const msg=ex?.message||'Erreur inconnue';
      console.warn('[SERAO] auth error:',ex);
      if(/délai dépassé|timed? out|Failed to fetch|NetworkError|ERR_BLOCKED/i.test(msg)){
        setErr('Le serveur met trop de temps à répondre. Réessaie dans quelques secondes. Si ça persiste : vérifie ta connexion ou désactive AdBlock / Brave Shields.');
      } else {
        setErr(msg);
      }
    }
    finally{setBusy(false);}
  };

  const forgotPassword=async()=>{
    setErr('');setInfo('');
    if(!f.email){setErr('Entre ton email d\'abord.');return;}
    setBusy(true);
    try{
      const{error}=await supabase.auth.resetPasswordForEmail(f.email,{redirectTo:SITE_URL+'?reset=1'});
      if(error){setErr(error.message);return;}
      setInfo('Email de réinitialisation envoyé. Vérifie ta boîte (et tes spams).');
    }catch(ex){setErr(ex.message||'Erreur');}
    finally{setBusy(false);}
  };
  return(<div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div className="modal">
      <div style={{textAlign:'center',marginBottom:'24px'}}>
        <div style={{fontSize:'40px',marginBottom:'8px'}}>🌿</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:800,background:'linear-gradient(135deg,var(--emerald-glow),var(--cyan))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>SERAO</div>
        <div style={{fontSize:'13px',color:'var(--muted)',marginTop:'4px'}}>Rejoignez la communauté malagasy</div>
      </div>
      <div className="auth-tabs">
        <div className={'auth-tab'+(tab==='login'?' on':'')} onClick={()=>setTab('login')}>Connexion</div>
        <div className={'auth-tab'+(tab==='register'?' on':'')} onClick={()=>setTab('register')}>Inscription</div>
      </div>
      {tab==='register'&&<div style={{marginBottom:'18px'}}>
        <div className="fl">Je suis...</div>
        <div className="kyc-role-grid">
          {[{id:'acheteur',icon:'🛍️',name:'Acheteur',desc:'Découvrir & acheter'},{id:'vendeur',icon:'🏪',name:'Vendeur',desc:'Vendre mes produits'}].map(r=>(
            <div key={r.id} className={'kyc-role'+(role===r.id?' on':'')} onClick={()=>setRole(r.id)}>
              <div className="kyc-role-icon">{r.icon}</div>
              <div style={{fontWeight:700}}>{r.name}</div>
              <div style={{fontSize:'12px',color:'var(--muted)'}}>{r.desc}</div>
            </div>
          ))}
        </div>
      </div>}
      <form onSubmit={submit}>
        {tab==='register'&&<div className="fg"><label className="fl">Nom complet</label><input className="fi" value={f.nom} onChange={e=>set('nom',e.target.value)} placeholder="Votre nom" autoFocus/></div>}
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email} onChange={e=>set('email',e.target.value)} placeholder="votre@email.com" autoFocus={tab==='login'}/></div>
        <div className="fg"><label className="fl">Mot de passe</label><input className="fi" type="password" value={f.password} onChange={e=>set('password',e.target.value)} placeholder={tab==='login'?'Votre mot de passe':'Choisir un mot de passe'}/></div>
        {err&&<p style={{color:'#fca5a5',fontSize:'13px',marginBottom:'12px'}}>{err}</p>}
        {info&&<p style={{color:'var(--emerald-glow)',fontSize:'13px',marginBottom:'12px'}}>{info}</p>}
        <Btn type="submit" style={{width:'100%'}} disabled={busy}>{busy?'…':(tab==='login'?'Se connecter →':'Créer mon compte →')}</Btn>
      </form>
      {tab==='login'&&(
        <div style={{marginTop:'14px',textAlign:'center'}}>
          <button type="button" onClick={forgotPassword} disabled={busy} style={{background:'none',border:'none',color:'var(--cyan-light)',fontSize:'13px',cursor:'pointer',textDecoration:'underline'}}>Mot de passe oublié ?</button>
        </div>
      )}
    </div>
  </div>);
}

/* ─ RESET PASSWORD MODAL — shown when user lands from a recovery link ─ */
function ResetPasswordModal({onClose, showToast}){
  const[pw,setPw]=useState('');
  const[pw2,setPw2]=useState('');
  const[busy,setBusy]=useState(false);
  const[err,setErr]=useState('');
  const submit=async e=>{
    e.preventDefault();setErr('');
    if(pw.length<6){setErr('Minimum 6 caractères.');return;}
    if(pw!==pw2){setErr('Les deux mots de passe ne correspondent pas.');return;}
    setBusy(true);
    const{error}=await supabase.auth.updateUser({password:pw});
    setBusy(false);
    if(error){setErr(error.message);return;}
    showToast('Mot de passe mis à jour ✓');
    onClose();
  };
  return(<div className="modal-bg">
    <div className="modal">
      <div className="modal-title">🔑 Définir un nouveau mot de passe</div>
      <p style={{color:'var(--muted)',fontSize:'14px',marginBottom:'18px'}}>
        Tu viens de cliquer sur un lien de réinitialisation. Choisis un nouveau mot de passe.
      </p>
      <form onSubmit={submit}>
        <div className="fg"><label className="fl">Nouveau mot de passe</label><input className="fi" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="6 caractères minimum" autoFocus/></div>
        <div className="fg"><label className="fl">Confirmer</label><input className="fi" type="password" value={pw2} onChange={e=>setPw2(e.target.value)}/></div>
        {err&&<p style={{color:'#fca5a5',fontSize:'13px',marginBottom:'12px'}}>{err}</p>}
        <div className="modal-foot">
          <Btn v="glass" type="button" onClick={onClose} disabled={busy}>Annuler</Btn>
          <Btn type="submit" disabled={busy}>{busy?'…':'Enregistrer'}</Btn>
        </div>
      </form>
    </div>
  </div>);
}

/* ─ ADMIN ─ */
function AdminPanel({onClose, refreshProducts}){
  const[tab,setTab]=useState('dash');
  const[products,setProducts]=useState([]);
  const[orders,setOrders]=useState([]);
  const[users,setUsers]=useState([]);
  const[msgs,setMsgs]=useState([]);
  const[loading,setLoading]=useState(true);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const[p,o,u,m]=await Promise.all([
      supabase.from('products').select('*,category:categories(nom,slug,emoji)').order('created_at',{ascending:false}),
      supabase.from('orders').select('*').order('created_at',{ascending:false}),
      supabase.rpc('admin_list_users'), // full rows incl. email, gated by is_admin() (cf. S3)
      supabase.from('messages').select('*').order('created_at',{ascending:false}).limit(100),
    ]);
    setProducts(p.data||[]);
    setOrders(o.data||[]);
    setUsers(u.data||[]);
    setMsgs(m.data||[]);
    setLoading(false);
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  const totalCA=orders.reduce((s,o)=>s+Number(o.montant||0),0);
  const TABS=[{id:'dash',l:'Dashboard',i:'📊'},{id:'products',l:'Produits',i:'📦'},{id:'orders',l:'Commandes',i:'🚚'},{id:'users',l:'Membres',i:'👥'},{id:'messages',l:'Messages',i:'💬'}];

  const delProduct=async(p)=>{
    if(!window.confirm(`Supprimer "${p.nom}" ?`))return;
    const{error}=await supabase.from('products').delete().eq('id',p.id);
    if(error){window.alert(error.message);return;}
    loadAll();refreshProducts?.();
  };
  const toggleActive=async(p)=>{
    const{error}=await supabase.from('products').update({active:!p.active}).eq('id',p.id);
    if(error){window.alert(error.message);return;}
    loadAll();refreshProducts?.();
  };
  const setOrderStatus=async(o,status)=>{
    const{error}=await supabase.from('orders').update({status}).eq('id',o.id);
    if(error){window.alert(error.message);return;}
    setOrders(orders.map(x=>x.id===o.id?{...x,status}:x));
  };
  const setUserRole=async(u,role)=>{
    const{error}=await supabase.rpc('admin_set_role',{p_user:u.id,p_role:role});
    if(error){window.alert(error.message);return;}
    setUsers(users.map(x=>x.id===u.id?{...x,role}:x));
  };
  const delMsg=async(m)=>{
    if(!window.confirm('Supprimer ce message ?'))return;
    const{error}=await supabase.from('messages').delete().eq('id',m.id);
    if(error){window.alert(error.message);return;}
    setMsgs(msgs.filter(x=>x.id!==m.id));
  };
  const getUser=id=>users.find(u=>u.id===id);

  return(<div className="admin-panel">
    <div className="admin-side">
      <div className="admin-logo">SERAO<span className="a-badge">ADMIN</span></div>
      <nav className="admin-nav">
        {TABS.map(t=><div key={t.id} className={'a-link'+(tab===t.id?' on':'')} onClick={()=>setTab(t.id)}><span style={{fontSize:'16px'}}>{t.i}</span><span>{t.l}</span></div>)}
      </nav>
      <div className="admin-foot"><div className="admin-close" onClick={onClose}><span style={{fontSize:'16px'}}>←</span><span>Retour</span></div></div>
    </div>
    <div className="admin-main">
      {loading&&<div style={{color:'var(--muted)',padding:'40px',textAlign:'center'}}>Chargement…</div>}

      {!loading&&tab==='dash'&&<div>
        <div className="a-title">Dashboard</div>
        <div className="a-sub">Vue d'ensemble de SERAO</div>
        <div className="stat-grid">
          {[{i:'💰',v:fmt(totalCA),l:'Chiffre d\'affaires'},{i:'📦',v:orders.length,l:'Commandes'},{i:'🛍️',v:products.filter(p=>p.active).length,l:'Produits actifs'},{i:'👥',v:users.length,l:'Membres'},{i:'💬',v:msgs.length,l:'Messages (récents)'}].map((s,i)=>(
            <div key={i} className="stat-card"><div className="stat-ico">{s.i}</div><div className="stat-val">{s.v}</div><div className="stat-lbl">{s.l}</div></div>
          ))}
        </div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>ID</th><th>Produit</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>{orders.slice(0,10).map(o=>{const buyer=getUser(o.acheteur_id);return(<tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.product_nom}</td><td>{buyer?.nom||buyer?.email||'—'}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(o.montant)}</td><td><span className={'s-pill '+(o.status==='livre'?'s-ok':o.status==='expedie'||o.status==='transit'?'s-warn':o.status==='annule'?'s-err':'s-ok')}>{o.status}</span></td><td style={{color:'var(--muted)'}}>{o.created_at?.slice(0,10)}</td></tr>);})}</tbody></table></div>
      </div>}

      {!loading&&tab==='products'&&<div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px'}}>
          <div><div className="a-title">Produits</div><div className="a-sub">{products.length} produits ({products.filter(p=>p.active).length} actifs)</div></div>
        </div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th></th><th>Nom</th><th>Catégorie</th><th>Vendeur</th><th>Prix</th><th>Actif</th><th>Actions</th></tr></thead><tbody>{products.map(p=>{const v=getUser(p.vendeur_id);return(<tr key={p.id}><td style={{fontSize:'24px'}}>{p.emoji}</td><td style={{fontWeight:600}}>{p.nom}</td><td>{p.category?.nom||'—'}</td><td style={{color:'var(--muted)'}}>{v?.nom||v?.email||'—'}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(p.prix)}</td><td><span className={'s-pill '+(p.active?'s-ok':'s-err')}>{p.active?'oui':'non'}</span></td><td><div style={{display:'flex',gap:'6px'}}><Btn sm v="glass" onClick={()=>toggleActive(p)}>{p.active?'❌':'✅'}</Btn><Btn sm v="danger" onClick={()=>delProduct(p)}>🗑️</Btn></div></td></tr>);})}</tbody></table></div>
      </div>}

      {!loading&&tab==='orders'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Commandes</div>
        <div className="a-sub">{orders.length} commandes</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>ID</th><th>Produit</th><th>Client</th><th>Montant</th><th>Paiement</th><th>Statut</th><th>Date</th></tr></thead><tbody>{orders.map(o=>{const buyer=getUser(o.acheteur_id);return(<tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.product_nom}</td><td>{buyer?.nom||buyer?.email||'—'}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(o.montant)}</td><td>{o.pay_method||'—'}</td><td><select className="fi" style={{height:'32px',padding:'0 10px',fontSize:'13px',width:'130px',borderRadius:'var(--r-pill)'}} value={o.status} onChange={e=>setOrderStatus(o,e.target.value)}>{['confirme','preparation','expedie','transit','livre','annule'].map(s=><option key={s}>{s}</option>)}</select></td><td style={{color:'var(--muted)'}}>{o.created_at?.slice(0,10)}</td></tr>);})}</tbody></table></div>
      </div>}

      {!loading&&tab==='users'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Membres</div>
        <div className="a-sub">{users.length} comptes</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Inscription</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><div style={{display:'flex',alignItems:'center',gap:'8px'}}><div style={{width:28,height:28,borderRadius:'50%',background:avColor(u.nom||u.email||'?'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:700}}>{initials(u.nom||u.email||'?')}</div><strong>{u.nom||'(sans nom)'}</strong></div></td><td style={{color:'var(--emerald-glow)'}}>{u.email}</td><td><select className="fi" style={{height:'30px',padding:'0 10px',fontSize:'13px',width:'120px',borderRadius:'var(--r-pill)'}} value={u.role} onChange={e=>setUserRole(u,e.target.value)}>{['acheteur','vendeur','admin'].map(r=><option key={r}>{r}</option>)}</select></td><td style={{color:'var(--muted)'}}>{u.created_at?.slice(0,10)}</td></tr>)}</tbody></table></div>
      </div>}

      {!loading&&tab==='messages'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Messages</div>
        <div className="a-sub">{msgs.length} messages récents</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>De</th><th>Vers</th><th>Message</th><th>Heure</th><th>Action</th></tr></thead><tbody>{msgs.slice(0,30).map(m=>{const sender=getUser(m.from_user);const target=m.channel?{nom:'# '+m.channel}:getUser(m.to_user);return(<tr key={m.id}><td>{sender?.nom||sender?.email||'?'}</td><td style={{color:'var(--emerald-glow)'}}>{target?.nom||target?.email||'?'}</td><td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.content}</td><td style={{color:'var(--muted)'}}>{fmtT(m.created_at)}</td><td><Btn sm v="danger" onClick={()=>delMsg(m)}>🗑️</Btn></td></tr>);})}</tbody></table></div>
      </div>}
    </div>
  </div>);
}

/* ─ PAGES ─ */
function PageAccueil({nav,onBuy,products,articles,stats}){
  const compact=n=>{n=Number(n)||0;if(n>=1000)return (n/1000).toFixed(n>=10000?0:1).replace('.0','')+'K';return String(n);};
  const heroStats=[
    {v:stats?compact(stats.vendeurs):'—',l:'Vendeurs actifs'},
    {v:stats?compact(stats.produits):'—',l:'Produits en ligne'},
    {v:stats?compact(stats.membres):'—',l:'Membres inscrits'},
    {v:'48h',l:'Livraison max'},
  ];
  return(<>
    <section className="hero">
      <div className="wrap" style={{width:'100%'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
          <div className="hero-eye"><div className="hero-eye-dot"/><span>Marketplace Malagasy · Produits Authentiques</span></div>
          <h1 className="hero-title">SERAO</h1>
          <p className="hero-sub">La plus premium des marketplaces malagasy. Produits authentiques, livrés avec soin.</p>
          <div className="hero-ctas">
            <Btn onClick={()=>nav('catalogue')}>🛍️ Explorer le catalogue</Btn>
            <Btn v="glass" onClick={()=>nav('vendeur')}>🏪 Devenir vendeur</Btn>
          </div>
          <div className="hero-stats">
            {heroStats.map((s,i)=>(
              <div key={i} className="hero-stat"><div className="hero-stat-val">{s.v}</div><div className="hero-stat-lbl">{s.l}</div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="scroll-ind"><span>Défiler</span><div className="scroll-line"/></div>
    </section>

    <section className="section">
      <div className="wrap">
        <div className="sec-top">
          <div><span className="sec-eye">Tendances</span><h2 className="sec-h">Les produits du moment</h2></div>
          <Btn v="glass" onClick={()=>nav('catalogue')}>Voir tout →</Btn>
        </div>
        <div className="pgrid">{products.slice(0,8).map(p=><ProdCard key={p.id} p={p} onBuy={()=>onBuy(p)}/>)}</div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
      <div className="wrap">
        <div className="sec-top"><div><span className="sec-eye">Explorer</span><h2 className="sec-h">Par catégorie</h2></div></div>
        <div className="catgrid">{CATS.map((c,i)=><div key={i} className="cattile" onClick={()=>nav('catalogue')}><div className="cat-emo">{c.emoji}</div><div className="cat-name">{c.nom}</div><div className="cat-count">{c.count} produits</div></div>)}</div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
      <div className="wrap">
        <div className="sec-top"><div><span className="sec-eye">Pourquoi SERAO ?</span><h2 className="sec-h">Une plateforme de confiance</h2></div></div>
        <div className="why-grid">{WHY.map((w,i)=><div key={i} className="why-card"><div className="why-num">0{i+1}</div><div className="why-icon">{w.icon}</div><div className="why-title">{w.t}</div><div className="why-body">{w.b}</div></div>)}</div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
      <div className="wrap">
        <div className="sec-top"><div><span className="sec-eye">Confiance</span><h2 className="sec-h">Vendeurs à la une</h2></div></div>
        <div className="vgrid">{VENDORS_D.map((v,i)=><div key={i} className="vcard"><div className="vcard-av">{v.emoji}</div><div><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><span className="vcard-name">{v.nom}</span><Badge kind="verif"/></div><div className="vcard-city">{v.ville}</div><div className="vcard-stats"><span style={{color:'var(--emerald-glow)'}}>★ {v.note}</span><span style={{color:'var(--subtle)'}}>·</span><span>{v.nb} produits</span></div></div></div>)}</div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
      <div className="wrap">
        <div className="sec-top"><div><span className="sec-eye">Magazine</span><h2 className="sec-h">Articles récents</h2></div></div>
        <div className="agrid">{articles.filter(a=>a.publie).map((a,i)=>(
          <article key={i} className="acard" onClick={()=>nav('blog')}>
            <div style={{display:'flex',gap:'8px',marginBottom:'12px',flexWrap:'wrap'}}>
              <span className="acard-tag">📰 {a.min} min</span>
              <span className="acard-tag">{a.date}</span>
            </div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'10px',lineHeight:1.3,color:'var(--text)'}}>{a.titre}</h3>
            <p style={{fontSize:'14px',color:'var(--muted)',lineHeight:1.6,marginBottom:'14px'}}>{a.extrait}</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>{a.tags.map((t,j)=><span key={j} className="acard-tag">{t}</span>)}</div>
          </article>
        ))}</div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
      <div className="wrap">
        <div className="cta-band">
          <div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'clamp(22px,3vw,32px)',fontWeight:800,color:'#fff',marginBottom:'10px'}}>Vendez sur SERAO</div>
            <div style={{color:'rgba(255,255,255,.7)',fontSize:'16px'}}>Rejoignez des centaines de vendeurs malagasy et touchez des milliers de clients dans le monde.</div>
          </div>
          <Btn v="glass" onClick={()=>nav('vendeur')} style={{color:'#fff',borderColor:'rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)'}}>Commencer gratuitement →</Btn>
        </div>
      </div>
    </section>
  </>);
}

function PageCatalogue({products,onBuy}){
  const[catF,setCatF]=useState('Toutes');const[regF,setRegF]=useState('Toutes');const[tri,setTri]=useState('note');
  const cats=['Toutes',...new Set(products.map(p=>p.cat))];const regs=['Toutes',...new Set(products.map(p=>p.region))];
  let list=products.filter(p=>catF==='Toutes'||p.cat===catF).filter(p=>regF==='Toutes'||p.region===regF);
  if(tri==='prix-asc')list=[...list].sort((a,b)=>a.prix-b.prix);else if(tri==='prix-desc')list=[...list].sort((a,b)=>b.prix-a.prix);else list=[...list].sort((a,b)=>b.note-a.note);
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Catalogue</h1><p>{list.length} produits authentiques de Madagascar</p></div></div>
    <section className="section"><div className="wrap">
      <div className="filters">
        <select className="filter-sel" value={catF} onChange={e=>setCatF(e.target.value)}>{cats.map(c=><option key={c}>{c}</option>)}</select>
        <select className="filter-sel" value={regF} onChange={e=>setRegF(e.target.value)}>{regs.map(r=><option key={r}>{r}</option>)}</select>
        <select className="filter-sel" value={tri} onChange={e=>setTri(e.target.value)}><option value="note">Par note</option><option value="prix-asc">Prix ↑</option><option value="prix-desc">Prix ↓</option></select>
      </div>
      <div className="pgrid">{list.map(p=><ProdCard key={p.id} p={p} onBuy={()=>onBuy(p)}/>)}</div>
      {list.length===0&&<div style={{textAlign:'center',padding:'60px',color:'var(--muted)'}}>Aucun produit trouvé.</div>}
    </div></section>
  </div>);
}

function PageBlog({articles}){
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Blog & Guides</h1><p>Découvrez Madagascar à travers nos articles et guides pratiques.</p></div></div>
    <section className="section"><div className="wrap">
      <div className="agrid">{articles.filter(a=>a.publie).map((a,i)=>(
        <article key={i} className="acard" style={{padding:'32px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'16px'}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:avColor(a.auteur),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700}}>{a.auteur[0]}</div>
            <span style={{fontSize:'13px',color:'var(--muted)'}}>{a.auteur} · {a.min} min · {a.date}</span>
          </div>
          <h2 style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'12px',lineHeight:1.3,color:'var(--text)'}}>{a.titre}</h2>
          <p style={{fontSize:'14px',color:'var(--muted)',lineHeight:1.65,marginBottom:'16px'}}>{a.extrait}</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>{a.tags.map((t,j)=><span key={j} className="acard-tag">{t}</span>)}</div>
        </article>
      ))}</div>
    </div></section>
  </div>);
}

function PageLivraison(){
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>SERAO Delivery</h1><p>Suivi en temps réel · Livraison fiable partout à Madagascar</p></div></div>
    <section className="section"><div className="wrap">
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'16px',marginBottom:'40px'}}>
        {[{icon:'🏠',nom:'Domicile',prix:'15 000–30 000 Ar',d:'3-7 jours'},{icon:'📦',nom:'Point relais',prix:'8 000–15 000 Ar',d:'2-5 jours'},{icon:'🤝',nom:'Retrait vendeur',prix:'Gratuit',d:'Sur RDV'}].map((l,i)=>(
          <div key={i} className="glass" style={{padding:'28px',textAlign:'center',borderRadius:'var(--r-xl)'}}>
            <div style={{fontSize:'36px',marginBottom:'12px'}}>{l.icon}</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'17px',fontWeight:700,marginBottom:'6px'}}>{l.nom}</div>
            <div style={{color:'var(--cyan-light)',fontWeight:600,marginBottom:'4px'}}>{l.prix}</div>
            <div style={{fontSize:'13px',color:'var(--muted)'}}>⏱ {l.d}</div>
          </div>
        ))}
      </div>
      <div style={{marginBottom:'12px'}}>
        <span className="sec-eye">Suivi en direct</span>
        <h2 className="sec-h" style={{marginBottom:'24px'}}>Carte de livraison</h2>
      </div>
      <TrackingMap/>
    </div></section>
  </div>);
}

function PageLive(){
  const[url,setUrl]=useState('');const[key,setKey]=useState('');const[plats,setPlats]=useState([]);const[sent,setSent]=useState(false);
  const plist=[{id:'facebook',icon:'📘',nom:'Facebook Live'},{id:'youtube',icon:'▶️',nom:'YouTube Live'},{id:'twitch',icon:'💜',nom:'Twitch'},{id:'tiktok',icon:'🎵',nom:'TikTok'}];
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Diffusion Live</h1><p>Diffusez simultanément sur toutes les plateformes</p></div></div>
    <section className="section"><div className="wrap" style={{maxWidth:'600px'}}>
      <div className="fg"><label className="fl">URL du serveur RTMP</label><input className="fi" placeholder="rtmp://..." value={url} onChange={e=>setUrl(e.target.value)}/></div>
      <div className="fg"><label className="fl">Clé de stream</label><input className="fi" type="password" placeholder="••••••••" value={key} onChange={e=>setKey(e.target.value)}/></div>
      <div className="fg"><label className="fl">Plateformes</label>
        <div className="platform-grid">{plist.map(p=><div key={p.id} className={'ptile'+(plats.includes(p.id)?' on':'')} onClick={()=>setPlats(pp=>pp.includes(p.id)?pp.filter(x=>x!==p.id):[...pp,p.id])}><span style={{fontSize:'24px'}}>{p.icon}</span><span style={{fontWeight:600}}>{p.nom}</span>{plats.includes(p.id)&&<span style={{marginLeft:'auto',color:'var(--emerald-glow)'}}>✓</span>}</div>)}</div>
      </div>
      <Btn onClick={()=>{if(!url||!plats.length){alert('Remplissez l\'URL et sélectionnez une plateforme.');return;}setSent(true);setTimeout(()=>setSent(false),3000);}}>▶ Démarrer la diffusion</Btn>
      {sent&&<div style={{marginTop:'16px',padding:'16px',background:'var(--glass-emerald)',border:'1px solid rgba(20,123,99,0.3)',borderRadius:'var(--r-lg)',color:'var(--emerald-glow)',fontWeight:600}}>✓ Diffusion démarrée avec succès !</div>}
      <div style={{marginTop:'24px',padding:'16px',background:'rgba(245,159,10,0.08)',borderLeft:'3px solid var(--amber,#F59F0A)',borderRadius:'0 var(--r-md) var(--r-md) 0',fontSize:'13px',color:'var(--muted)'}}>⚠️ Vous êtes responsable du contenu diffusé. Respectez les CGU de chaque plateforme.</div>
    </div></section>
  </div>);
}

function PageAPropos({nav}){
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>À propos de SERAO</h1><p>SERAO est née d'une vision : rendre les produits authentiques de Madagascar accessibles à tous.</p></div></div>
    <section className="section"><div className="wrap">
      <div className="why-grid">{[{icon:'🎯',t:'Notre mission',b:"Valoriser le savoir-faire malagasy et créer un pont entre producteurs locaux et consommateurs du monde entier."},{icon:'🔭',t:'Notre vision',b:"Devenir la première marketplace de référence pour les produits authentiques de Madagascar."},{icon:'🤝',t:'Notre communauté',b:"Plus de 100 vendeurs vérifiés et des milliers de clients satisfaits nous font confiance."},{icon:'⚡',t:'Innovation',b:"IA, diffusion live, livraison intégrée — la technologie au service de l'artisanat malagasy."}].map((b,i)=><div key={i} className="why-card"><div className="why-icon">{b.icon}</div><div className="why-title">{b.t}</div><div className="why-body">{b.b}</div></div>)}</div>
      <div style={{marginTop:'40px'}}><div className="cta-band"><div><div style={{fontFamily:'var(--font-display)',fontSize:'28px',fontWeight:800,color:'#fff',marginBottom:'8px'}}>Rejoignez l'aventure</div><div style={{color:'rgba(255,255,255,.7)'}}>Que vous soyez vendeur ou acheteur, SERAO est votre plateforme.</div></div><Btn v="glass" onClick={()=>nav('vendeur')} style={{color:'#fff',borderColor:'rgba(255,255,255,0.3)',background:'rgba(255,255,255,0.1)'}}>Commencer →</Btn></div></div>
    </div></section>
  </div>);
}

/* ─ SIMPLE CONTENT PAGE (legal / info) ─ */
function PageContenu({titre,sous,sections}){
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>{titre}</h1><p>{sous}</p></div></div>
    <section className="section"><div className="wrap" style={{maxWidth:'820px'}}>
      {sections.map((s,i)=>(
        <div key={i} className="glass" style={{padding:'28px',borderRadius:'var(--r-xl)',marginBottom:'16px'}}>
          <h2 style={{fontFamily:'var(--font-display)',fontSize:'19px',fontWeight:700,marginBottom:'10px',color:'var(--text)'}}>{s.q}</h2>
          <p style={{fontSize:'15px',color:'var(--muted)',lineHeight:1.7,whiteSpace:'pre-line'}}>{s.a}</p>
        </div>
      ))}
    </div></section>
  </div>);
}

function PageFAQ(){
  return <PageContenu titre="Foire aux questions" sous="Les réponses aux questions les plus fréquentes sur SERAO." sections={[
    {q:'Comment passer une commande ?',a:"Parcourez le catalogue, cliquez sur un produit puis sur « + ». Connectez-vous (ou créez un compte), choisissez votre moyen de paiement Mobile Money (MVola, Orange Money ou Airtel Money) et validez. Vous recevez une référence de commande immédiatement."},
    {q:'Quels sont les moyens de paiement acceptés ?',a:"SERAO accepte MVola, Orange Money et Airtel Money. Le montant est toujours calculé à partir du prix réel du produit côté serveur — il ne peut pas être modifié."},
    {q:'Combien coûte la livraison ?',a:"Domicile : 15 000–30 000 Ar · Point relais : 8 000–15 000 Ar · Retrait chez le vendeur : gratuit. Les délais vont de 2 à 7 jours selon la région."},
    {q:'Comment devenir vendeur ?',a:"Créez un compte, allez dans « Devenir vendeur » et activez votre statut en un clic. L'inscription est gratuite : une commission de 3 % s'applique uniquement sur les ventes réalisées."},
    {q:'Mes données sont-elles protégées ?',a:"Oui. Votre email et votre téléphone ne sont jamais visibles par les autres membres. Seuls votre nom public et votre rôle le sont. Voir notre page Confidentialité."},
  ]}/>;
}

function PageContact({showToast}){
  const[f,setF]=useState({nom:'',email:'',msg:''});
  const set=(k,v)=>setF(ff=>({...ff,[k]:v}));
  const submit=e=>{e.preventDefault();if(!f.nom||!f.email||!f.msg){showToast('Remplis tous les champs','err');return;}showToast('Message envoyé ✓ Nous te répondrons vite.');setF({nom:'',email:'',msg:''});};
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Contact</h1><p>Une question, un partenariat, un souci ? Écris-nous.</p></div></div>
    <section className="section"><div className="wrap" style={{maxWidth:'600px'}}>
      <div className="glass" style={{padding:'28px',borderRadius:'var(--r-xl)',marginBottom:'20px',display:'grid',gap:'10px',fontSize:'14px',color:'var(--muted)'}}>
        <div>📧 <strong style={{color:'var(--text)'}}>contact@serao.mg</strong></div>
        <div>📞 <strong style={{color:'var(--text)'}}>+261 34 00 000 00</strong></div>
        <div>📍 Antananarivo, Madagascar · Lun–Sam 8h–18h</div>
      </div>
      <form onSubmit={submit}>
        <div className="fg"><label className="fl">Nom</label><input className="fi" value={f.nom} onChange={e=>set('nom',e.target.value)} placeholder="Votre nom"/></div>
        <div className="fg"><label className="fl">Email</label><input className="fi" type="email" value={f.email} onChange={e=>set('email',e.target.value)} placeholder="votre@email.com"/></div>
        <div className="fg"><label className="fl">Message</label><textarea className="fi" rows="5" value={f.msg} onChange={e=>set('msg',e.target.value)} placeholder="Votre message..."/></div>
        <Btn type="submit" style={{width:'100%'}}>Envoyer le message</Btn>
      </form>
    </div></section>
  </div>);
}

function PageCGU(){
  return <PageContenu titre="Conditions générales d'utilisation" sous="En vigueur · Dernière mise à jour : 2026." sections={[
    {q:'1. Objet',a:"SERAO est une marketplace mettant en relation des vendeurs et des acheteurs de produits malagasy. Les présentes conditions régissent l'utilisation de la plateforme."},
    {q:'2. Compte',a:"L'inscription est gratuite. Vous êtes responsable de la confidentialité de vos identifiants et de toute activité réalisée depuis votre compte."},
    {q:'3. Ventes et commission',a:"Les vendeurs fixent librement leurs prix. SERAO prélève une commission de 3 % sur chaque vente réalisée. Les vendeurs s'engagent à proposer des produits authentiques et conformes."},
    {q:'4. Paiement et livraison',a:"Les paiements s'effectuent via Mobile Money. Les délais et frais de livraison sont indiqués avant la validation de la commande."},
    {q:'5. Responsabilité',a:"SERAO agit comme intermédiaire. La responsabilité de la conformité des produits incombe au vendeur. Tout litige peut être signalé via la page Contact."},
  ]}/>;
}

function PageConfidentialite(){
  return <PageContenu titre="Politique de confidentialité" sous="Comment nous protégeons vos données personnelles." sections={[
    {q:'Données collectées',a:"Nous collectons : votre nom, votre email, et éventuellement votre téléphone et région. Ces informations sont nécessaires à la création de votre compte et au traitement des commandes."},
    {q:'Visibilité de vos données',a:"Votre email et votre téléphone ne sont JAMAIS visibles par les autres membres. Seuls votre nom public et votre rôle (acheteur/vendeur) apparaissent. L'accès complet est réservé à l'administration, à des fins de support."},
    {q:'Sécurité',a:"L'accès aux données est protégé par des règles de sécurité au niveau de la base (Row Level Security). Aucun visiteur non connecté ne peut consulter la liste des membres."},
    {q:'Vos droits',a:"Vous pouvez demander la consultation, la rectification ou la suppression de vos données à tout moment via la page Contact."},
    {q:'Cookies',a:"SERAO utilise uniquement un stockage local technique pour maintenir votre session connectée. Aucun cookie publicitaire tiers n'est nécessaire au fonctionnement du site."},
  ]}/>;
}

/* ─ VENDOR DASHBOARD — list & manage own products ─ */
function VendeurDashboard({user, showToast, refreshAll}){
  const blank={nom:'',description:'',category_id:'',region:'',prix:'',emoji:'🛍️',image_url:'',badge:'',deliv:'3-5 jours',stock:1};
  const[products,setProducts]=useState([]);
  const[categories,setCategories]=useState([]);
  const[editing,setEditing]=useState(null); // null | 'new' | productId
  const[form,setForm]=useState(blank);
  const[photoFile,setPhotoFile]=useState(null);
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const load=useCallback(async()=>{
    const[p,c]=await Promise.all([
      supabase.from('products').select('*,category:categories(nom,slug,emoji)').eq('vendeur_id',user.id).order('created_at',{ascending:false}),
      supabase.from('categories').select('*').order('display_order'),
    ]);
    setProducts(p.data||[]);setCategories(c.data||[]);
  },[user.id]);

  useEffect(()=>{load();},[load]);

  const openNew=()=>{setForm(blank);setPhotoFile(null);setEditing('new');};
  const openEdit=(p)=>{setForm({nom:p.nom||'',description:p.description||'',category_id:p.category_id||'',region:p.region||'',prix:p.prix||'',emoji:p.emoji||'🛍️',image_url:p.image_url||'',badge:p.badge||'',deliv:p.deliv||'3-5 jours',stock:p.stock||1});setPhotoFile(null);setEditing(p.id);};
  const cancel=()=>{setEditing(null);setForm(blank);setPhotoFile(null);};

  const submit=async()=>{
    if(!form.nom||!form.prix){showToast('Nom et prix requis','err');return;}
    if(photoFile && photoFile.size > 5*1024*1024){showToast('Photo trop lourde (>5 Mo). Compresse-la d\'abord.','err');return;}
    setBusy(true);
    try{
      let image_url=form.image_url;
      if(photoFile){
        const ext=(photoFile.name.split('.').pop()||'jpg').toLowerCase();
        const path=`${user.id}/${Date.now()}.${ext}`;
        console.log('[serao] upload', path, photoFile.size, 'bytes');
        const{error:upErr}=await withTimeout(
          supabase.storage.from('product-photos').upload(path,photoFile,{contentType:photoFile.type,upsert:false}),
          30000,
          'Upload photo'
        );
        if(upErr){console.warn('[serao] upload error',upErr);showToast('Upload échoué : '+upErr.message,'err');return;}
        const{data:pub}=supabase.storage.from('product-photos').getPublicUrl(path);
        image_url=pub.publicUrl;
        console.log('[serao] uploaded url', image_url);
      }
      const payload={
        vendeur_id:user.id,
        nom:form.nom,
        description:form.description||null,
        category_id:form.category_id?Number(form.category_id):null,
        region:form.region||null,
        prix:Number(form.prix),
        emoji:form.emoji||'🛍️',
        image_url:image_url||null,
        badge:form.badge||null,
        deliv:form.deliv,
        stock:Number(form.stock)||1,
        active:true,
      };
      console.log('[serao] product payload', payload);
      const res=await withTimeout(
        editing==='new'
          ? supabase.from('products').insert(payload).select().single()
          : supabase.from('products').update(payload).eq('id',editing).select().single(),
        10000,
        'Enregistrement du produit'
      );
      if(res.error){console.warn('[serao] product save error',res.error);showToast(res.error.message,'err');return;}
      showToast(editing==='new'?'Produit publié ✓':'Produit mis à jour ✓');
      cancel();
      load();refreshAll?.();
    }catch(ex){showToast(ex.message||'Erreur','err');}
    finally{setBusy(false);}
  };

  const del=async(p)=>{
    if(!window.confirm(`Supprimer "${p.nom}" ?`))return;
    const{error}=await supabase.from('products').delete().eq('id',p.id);
    if(error){showToast(error.message,'err');return;}
    showToast('Produit supprimé');
    load();refreshAll?.();
  };

  return(<div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'16px'}}>
      <div>
        <h2 className="sec-h" style={{marginBottom:'4px'}}>Ma boutique</h2>
        <div style={{color:'var(--muted)',fontSize:'14px'}}>{products.length} produit{products.length>1?'s':''} actif{products.length>1?'s':''}</div>
      </div>
      <Btn onClick={openNew}>+ Nouveau produit</Btn>
    </div>

    {products.length===0&&!editing&&(
      <div className="glass" style={{padding:'48px',textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'12px'}}>📦</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>Aucun produit pour l'instant</div>
        <div style={{color:'var(--muted)',marginBottom:'20px'}}>Ajoute ton premier produit pour qu'il apparaisse dans le catalogue.</div>
        <Btn onClick={openNew}>+ Ajouter mon premier produit</Btn>
      </div>
    )}

    {products.length>0&&(
      <div className="pgrid">
        {products.map(p=>(
          <article key={p.id} className="pcard">
            <div className="pcard-img">
              {p.image_url?<img src={p.image_url} alt={p.nom} className="pcard-photo" loading="lazy"/>:<div className="pcard-emo">{p.emoji}</div>}
              {p.badge&&<div className="pcard-badge-pos"><Badge kind={p.badge}/></div>}
            </div>
            <div className="pcard-body">
              <div className="pcard-meta">{p.category?.nom||'—'} · {p.region||'—'}</div>
              <div className="pcard-name">{p.nom}</div>
              <div className="pcard-foot">
                <span className="pcard-price">{fmt(p.prix)}</span>
                <div style={{display:'flex',gap:'6px'}}>
                  <Btn sm v="glass" onClick={()=>openEdit(p)}>✏️</Btn>
                  <Btn sm v="danger" onClick={()=>del(p)}>🗑️</Btn>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    )}

    {editing&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)cancel();}}>
        <div className="modal" style={{maxWidth:'620px'}}>
          <div className="modal-title">{editing==='new'?'Nouveau produit':'Modifier le produit'}</div>

          <div className="fg"><label className="fl">Photo du produit <span style={{color:'var(--muted)',fontWeight:400}}>(facultatif, max 5 Mo)</span></label>
            {!photoFile&&!form.image_url&&(
              <label htmlFor="prod-photo" style={{display:'block',padding:'24px',border:'2px dashed var(--glass-border-hi)',borderRadius:'var(--r-md)',textAlign:'center',cursor:'pointer',background:'var(--glass-1)',transition:'all .2s'}}>
                <div style={{fontSize:'32px',marginBottom:'6px'}}>📷</div>
                <div style={{fontSize:'14px',color:'var(--text)',fontWeight:500}}>Cliquer pour ajouter une photo</div>
                <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'4px'}}>JPG, PNG, WEBP — 5 Mo max</div>
              </label>
            )}
            {(photoFile||form.image_url)&&(
              <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-md)'}}>
                <img src={photoFile?URL.createObjectURL(photoFile):form.image_url} alt="aperçu" style={{width:80,height:80,objectFit:'cover',borderRadius:'var(--r-sm)',flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',color:'var(--text)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {photoFile?photoFile.name:'Image déjà publiée'}
                  </div>
                  <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'2px'}}>
                    {photoFile?`${(photoFile.size/1024).toFixed(0)} Ko · ${photoFile.type||'image'}`:'Sélectionne une nouvelle image pour la remplacer'}
                  </div>
                </div>
                <label htmlFor="prod-photo" className="btn btn-glass btn-sm" style={{cursor:'pointer'}}>Changer</label>
                <button type="button" onClick={()=>{setPhotoFile(null);set('image_url','');}} className="btn btn-danger btn-sm" style={{minWidth:'auto',padding:'0 10px'}}>✕</button>
              </div>
            )}
            <input id="prod-photo" type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0]||null;if(f&&f.size>5*1024*1024){showToast("Photo trop lourde (max 5 Mo). Compresse-la d'abord.","err");e.target.value='';return;}setPhotoFile(f);}} style={{display:'none'}}/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:'12px'}}>
            <div className="fg" style={{marginBottom:0}}><label className="fl">Emoji</label><input className="fi" value={form.emoji} onChange={e=>set('emoji',e.target.value)} maxLength={4}/></div>
            <div className="fg" style={{marginBottom:0}}><label className="fl">Nom *</label><input className="fi" value={form.nom} onChange={e=>set('nom',e.target.value)} placeholder="Vanille Bourbon Premium" autoFocus/></div>
          </div>

          <div className="fg" style={{marginTop:'12px'}}><label className="fl">Description</label><textarea className="fi" rows="3" value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Origine, mode de production, ce qui le rend unique..."/></div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
            <div className="fg"><label className="fl">Catégorie</label>
              <select className="fi" value={form.category_id} onChange={e=>set('category_id',e.target.value)}>
                <option value="">—</option>
                {categories.map(c=><option key={c.id} value={c.id}>{c.emoji} {c.nom}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Région</label><input className="fi" value={form.region} onChange={e=>set('region',e.target.value)} placeholder="SAVA, Toamasina..."/></div>
            <div className="fg"><label className="fl">Prix (Ar) *</label><input className="fi" type="number" min="0" value={form.prix} onChange={e=>set('prix',e.target.value)}/></div>
            <div className="fg"><label className="fl">Stock</label><input className="fi" type="number" min="0" value={form.stock} onChange={e=>set('stock',e.target.value)}/></div>
            <div className="fg"><label className="fl">Délai livraison</label><input className="fi" value={form.deliv} onChange={e=>set('deliv',e.target.value)} placeholder="3-5 jours"/></div>
            <div className="fg"><label className="fl">Badge</label>
              <select className="fi" value={form.badge} onChange={e=>set('badge',e.target.value)}>
                <option value="">Aucun</option><option value="top">Top vendeur</option><option value="spons">Sponsorisé</option><option value="new">Nouveau</option>
              </select>
            </div>
          </div>

          {busy&&(
            <div style={{padding:'12px',background:'var(--glass-emerald)',borderRadius:'var(--r-md)',fontSize:'13px',color:'var(--cyan-light)',marginBottom:'12px',display:'flex',alignItems:'center',gap:'10px'}}>
              <div className="pay-spinner" style={{width:20,height:20,borderWidth:2,margin:0}}/>
              {photoFile?'Upload de la photo...':'Enregistrement...'}
            </div>
          )}
          <div className="modal-foot">
            <Btn v="glass" onClick={cancel} disabled={busy}>Annuler</Btn>
            <Btn onClick={submit} disabled={busy}>{busy?'…':(editing==='new'?'Publier':'Enregistrer')}</Btn>
          </div>
        </div>
      </div>
    )}
  </div>);
}

function PageVendeur({user,showToast,setShowAuth,refreshUser,refreshProducts}){
  const becomeVendor=async()=>{
    if(!user){setShowAuth(true);return;}
    // Role change goes through a controlled SECURITY DEFINER function: the
    // client can no longer write `role` directly (cf. S2). It only ever
    // promotes acheteur → vendeur, never to admin.
    const{error}=await supabase.rpc('request_vendor');
    if(error){showToast(error.message,'err');return;}
    showToast('Tu es maintenant vendeur 🎉');
    refreshUser?.();
  };

  const canSell = user?.role==='vendeur' || user?.role==='admin';

  return(<div>
    <div className="page-hero"><div className="wrap">
      <h1>{canSell?'Espace vendeur':'Devenir vendeur'}</h1>
      <p>{canSell?'Gère ton catalogue, suis tes ventes, dialogue avec tes clients.':'Inscription rapide · Aucun frais fixe · Commission uniquement sur ventes (3%)'}</p>
    </div></div>
    <section className="section"><div className="wrap">
      {canSell?(
        <VendeurDashboard user={user} showToast={showToast} refreshAll={refreshProducts}/>
      ):(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'40px',alignItems:'start'}}>
          <div>
            <h3 style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:700,marginBottom:'20px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Avantages inclus</h3>
            <ul className="avantages">
              {['Accès à des milliers de clients','Tableau de bord vendeur complet','Photos produits illimitées','Paiement Mobile Money intégré','Support dédié 7j/7','Badge vendeur vérifié','Commission uniquement sur ventes'].map((a,i)=>(
                <li key={i}><div className="av-check">✓</div>{a}</li>
              ))}
            </ul>
          </div>
          <div className="glass" style={{padding:'32px',textAlign:'center'}}>
            <div style={{fontSize:'56px',marginBottom:'16px'}}>🏪</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'8px'}}>Prêt à vendre sur SERAO ?</div>
            <div style={{color:'var(--muted)',fontSize:'15px',marginBottom:'24px',lineHeight:1.6}}>
              {user?'Active ton statut vendeur en un clic et commence à publier tes produits.':'Crée un compte (ou connecte-toi) puis active ton statut vendeur.'}
            </div>
            <Btn onClick={becomeVendor} style={{width:'100%'}}>
              {user?'Activer mon statut vendeur →':'Se connecter pour commencer →'}
            </Btn>
            <div style={{marginTop:'20px',padding:'12px',background:'var(--glass-emerald)',borderRadius:'var(--r-md)',fontSize:'12px',color:'var(--muted)'}}>
              💰 Inscription gratuite · 3% de commission sur les ventes réalisées
            </div>
          </div>
        </div>
      )}
    </div></section>
  </div>);
}

function Footer({nav}){
  return(<footer className="footer">
    <div className="wrap footer-in">
      <div>
        <div className="footer-logo">SERAO</div>
        <p style={{color:'var(--muted)',fontSize:'14px',lineHeight:1.6,maxWidth:'260px'}}>La marketplace premium des produits authentiques de Madagascar.</p>
        <div style={{display:'flex',gap:'10px',marginTop:'16px'}}>
          {['📘','📸','🐦','▶️'].map((icon,i)=><div key={i} style={{width:36,height:36,borderRadius:'var(--r-md)',background:'var(--glass-2)',border:'1px solid var(--glass-border)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'16px'}}>{icon}</div>)}
        </div>
      </div>
      <div className="footer-cols">
        {[{t:'Marketplace',items:[['catalogue','Catalogue'],['catalogue','Vanille'],['catalogue','Artisanat'],['catalogue','Épices']]},{t:'Services',items:[['livraison','Livraison'],['live','Live Shopping'],['livraison','Points relais'],['vendeur','Devenir vendeur']]},{t:'Infos',items:[['apropos','À propos'],['blog','Blog'],['contact','Contact'],['faq','FAQ']]},{t:'Légal',items:[['confidentialite','Confidentialité'],['cgu','Conditions'],['confidentialite','Cookies']]}].map(c=>(
          <div key={c.t}><div className="footer-col-title">{c.t}</div>{c.items.map(([page,label])=><div key={label} className="footer-link" onClick={()=>nav(page)}>{label}</div>)}</div>
        ))}
      </div>
    </div>
    <div className="footer-copy"><div className="wrap" style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'8px'}}><span>© 2026 SERAO. Tous droits réservés.</span><span>Fabriqué avec <span style={{color:'var(--emerald-glow)'}}>❤</span> à Madagascar</span></div></div>
  </footer>);
}

/* ─ APP ─ */
function App(){
  const[page,setPage]=useState('accueil');
  const[cart,setCart]=useState(0);
  const[menu,setMenu]=useState(false);
  const[toast,setToast]=useState('');
  const[toastType,setToastType]=useState('ok');
  const[user,setUser]=useState(null);
  const[authLoading,setAuthLoading]=useState(true);
  const[showAuth,setShowAuth]=useState(false);
  const[showChat,setShowChat]=useState(false);
  const[unread,setUnread]=useState(0);
  const[adminOpen,setAdminOpen]=useState(false);
  const[userMenu,setUserMenu]=useState(false);
  const[payProduct,setPayProduct]=useState(null);
  const[logoClicks,setLogoClicks]=useState(0);
  const logoTimer=useRef(null);
  const userMenuRef=useRef(null);

  const[products,setProducts]=useState([]);
  const[articles]=useState(()=>ls.get('articles',DEF_ARTICLES));
  const[orders,setOrders]=useState([]);
  const[stats,setStats]=useState(null);

  const nav=p=>{setPage(p);setMenu(false);setUserMenu(false);window.scrollTo({top:0,behavior:'smooth'});};
  const showToast=(msg,type='ok')=>{setToast(msg);setToastType(type);setTimeout(()=>setToast(''),4000);};

  // Helper: fetch the profile row for a given Supabase user.
  // - maybeSingle() : returns null instead of erroring when no row exists
  // - withTimeout   : prevents the auth callback from hanging forever if the
  //                   request silently stalls (extension, network, RLS loop).
  const fetchProfile=async(authUser)=>{
    if(!authUser)return null;
    try{
      // Only the columns `authenticated` is allowed to read (cf. S3). The
      // email comes from the auth session (authUser.email), so we never need
      // to expose it through the profiles table.
      const{data,error}=await withTimeout(
        supabase.from('profiles').select('id,nom,role,region,avatar_url,verified,created_at').eq('id',authUser.id).maybeSingle(),
        10000,
        'Chargement du profil'
      );
      if(error)console.warn('[SERAO] profile fetch error:',error);
      return data?{...authUser,...data}:authUser;
    }catch(ex){
      console.warn('[SERAO] profile fetch failed, using auth user only:',ex);
      return authUser;
    }
  };

  // Password reset flow: when the user lands with ?reset=1 (after clicking the reset email link)
  const[resetMode,setResetMode]=useState(()=>{
    if(typeof window==='undefined')return false;
    return new URLSearchParams(window.location.search).has('reset');
  });

  // Restore session on load + subscribe to auth changes.
  // We only re-fetch the profile on real auth transitions (SIGNED_IN /
  // SIGNED_OUT / USER_UPDATED). TOKEN_REFRESHED fires every ~hour and would
  // otherwise trigger a useless re-render of the whole app.
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      try{
        const{data:{session}}=await supabase.auth.getSession();
        if(!mounted)return;
        if(session?.user){
          const u=await fetchProfile(session.user);
          if(mounted)setUser(u);
        }
      }catch(ex){console.warn('[SERAO] getSession failed:',ex);}
      finally{if(mounted)setAuthLoading(false);}
    })();
    const{data:sub}=supabase.auth.onAuthStateChange(async(evt,session)=>{
      if(evt==='PASSWORD_RECOVERY'){setResetMode(true);return;}
      if(evt==='SIGNED_OUT'){setUser(null);return;}
      if(evt==='SIGNED_IN'||evt==='USER_UPDATED'){
        if(!session?.user){setUser(null);return;}
        const u=await fetchProfile(session.user);
        if(mounted)setUser(u);
      }
      // TOKEN_REFRESHED, INITIAL_SESSION : ignore — handled by getSession above.
    });
    return()=>{mounted=false;sub.subscription.unsubscribe();};
  },[]);

  // Load products from Supabase (anyone can read active products via RLS)
  const refreshProducts=useCallback(async()=>{
    const{data,error}=await supabase
      .from('products')
      .select('*,category:categories(nom,slug,emoji)')
      .eq('active',true)
      .order('created_at',{ascending:false});
    if(error){console.warn('products load error',error);return;}
    setProducts((data||[]).map(mapProductRow));
  },[]);
  useEffect(()=>{refreshProducts();},[refreshProducts]);

  // Real platform stats for the homepage hero (counts only, no PII).
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const{data,error}=await supabase.rpc('platform_stats');
      if(!mounted||error)return;
      setStats(data);
    })();
    return()=>{mounted=false;};
  },[]);

  const refreshUser=useCallback(async()=>{
    const{data:{user:au}}=await supabase.auth.getUser();
    if(!au){setUser(null);return;}
    const u=await fetchProfile(au);
    setUser(u);
  },[]);

  // Load orders when user logs in (RLS only returns own orders)
  useEffect(()=>{
    if(!user){setOrders([]);return;}
    let mounted=true;
    (async()=>{
      const{data,error}=await supabase
        .from('orders')
        .select('*')
        .order('created_at',{ascending:false});
      if(!mounted||error)return;
      setOrders((data||[]).map(o=>({
        id:o.id,produit:o.product_nom,client:o.acheteur_id===user.id?(user.nom||'Moi'):'',montant:Number(o.montant),status:o.status,date:o.created_at?.slice(0,10)
      })));
    })();
    return()=>{mounted=false;};
  },[user]);

  // Real unread badge (replaces the old localStorage stub).
  // Counts messages addressed to me (public channels or my DMs) that arrived
  // after the last time I opened the chat. "Last seen" is stored per-user in
  // localStorage, so opening the chat clears the badge — no DB write needed.
  useEffect(()=>{
    if(!user){setUnread(0);return;}
    let mounted=true;
    const seenKey='serao_lastseen_'+user.id;
    const calc=async()=>{
      const since=localStorage.getItem(seenKey)||'1970-01-01T00:00:00Z';
      const{data}=await supabase
        .from('messages')
        .select('id,from_user,channel,to_user,created_at')
        .gt('created_at',since)
        .order('created_at',{ascending:false})
        .limit(100);
      if(!mounted)return;
      const n=(data||[]).filter(m=>m.from_user!==user.id&&(m.channel||m.to_user===user.id)).length;
      setUnread(n);
    };
    calc();
    const iv=setInterval(calc,15000);
    return()=>{mounted=false;clearInterval(iv);};
  },[user,showChat]);

  // Opening the chat marks everything up to now as seen.
  useEffect(()=>{
    if(showChat&&user){
      try{localStorage.setItem('serao_lastseen_'+user.id,new Date().toISOString());}catch{}
      setUnread(0);
    }
  },[showChat,user]);

  const login=async(authUser)=>{
    // Hydrate with profile in the background so the toast can show the user's
    // display name. The auth listener will also run this, but we want a snappy
    // close + welcome here too.
    const u=await fetchProfile(authUser);
    setUser(u);
    setShowAuth(false);
    showToast(`Bienvenue, ${u?.nom||u?.email||''} ! 👋`);
  };
  const logout=async()=>{
    try{await supabase.auth.signOut();}
    catch(ex){console.warn('[SERAO] signOut error:',ex);}
    setUser(null);setShowChat(false);setUserMenu(false);showToast('Déconnecté');
  };
  const onBuy=p=>{if(user){setPayProduct(p);}else{setShowAuth(true);}};

  useEffect(()=>{
    const h=e=>{if(userMenuRef.current&&!userMenuRef.current.contains(e.target))setUserMenu(false);};
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);
  },[]);

  const handleLogo=()=>{
    nav('accueil');
    setLogoClicks(n=>{const nx=n+1;clearTimeout(logoTimer.current);logoTimer.current=setTimeout(()=>setLogoClicks(0),2000);if(nx>=5){setLogoClicks(0);setAdminOpen(true);}return nx;});
  };

  const LINKS=[{id:'accueil',l:'Accueil'},{id:'catalogue',l:'Catalogue'},{id:'blog',l:'Blog'},{id:'livraison',l:'Livraison'},{id:'live',l:'Live'},{id:'apropos',l:'À propos'}];

  const isAdmin=user?.role==='admin';

  if(adminOpen&&isAdmin){
    return(<>
      <AdminPanel onClose={()=>setAdminOpen(false)} refreshProducts={refreshProducts}/>
      {toast&&<div className="toast"><span className={toastType==='ok'?'t-ok':'t-err'}>{toastType==='ok'?'✓':'✗'}</span>{toast}</div>}
    </>);
  }

  return(<div className="app-root">
    {showAuth&&<AuthModal user={user} onAuth={login} onClose={()=>setShowAuth(false)}/>}
    {resetMode&&<ResetPasswordModal onClose={()=>{setResetMode(false);window.history.replaceState({},'',SITE_URL);}} showToast={showToast}/>}
    {payProduct&&<PaymentModal product={payProduct} user={user} onClose={()=>{setPayProduct(null);setCart(c=>c+1);}} showToast={showToast}/>}
    {adminOpen&&!isAdmin&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}>
        <div className="modal">
          <div className="modal-title">🔐 Accès Admin SERAO</div>
          <p style={{color:'var(--muted)',fontSize:'14px',marginBottom:'16px'}}>
            Cette zone est réservée aux comptes avec le rôle <strong style={{color:'var(--text)'}}>admin</strong>.
            {!user&&' Connecte-toi avec un compte admin.'}
            {user&&user.role!=='admin'&&` Tu es actuellement connecté en tant que ${user.role}.`}
          </p>
          <Btn v="glass" onClick={()=>setAdminOpen(false)} style={{width:'100%'}}>Fermer</Btn>
        </div>
      </div>
    )}

    <nav className="nav">
      <div className="wrap nav-in">
        <div className="nav-logo" onClick={handleLogo}>SERAO</div>
        <div className="navlinks">{LINKS.map(l=><div key={l.id} className={'nl'+(page===l.id?' on':'')} onClick={()=>nav(l.id)}>{l.l}</div>)}</div>
        <div className="nav-r">
          {user?(<>
            <button className="nav-iconbtn" onClick={()=>setShowChat(s=>!s)} title="Messages">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {unread>0&&<span className="notif-dot">{unread>9?'9+':unread}</span>}
            </button>
            <button className="nav-iconbtn" onClick={()=>showToast(`🛒 Panier : ${cart} article(s)`)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              {cart>0&&<span className="cart-dot">{cart}</span>}
            </button>
            <div style={{position:'relative'}} ref={userMenuRef}>
              <div className="user-pill" onClick={()=>setUserMenu(s=>!s)}>
                <div className="u-av">{initials(user.nom||user.email||'?')}</div>
                <div><div className="u-name">{(user.nom||user.email||'').split(' ')[0]||'…'}</div><div className="u-role">{user.role||'membre'}</div></div>
              </div>
              {userMenu&&<div className="user-dropdown">
                <div className="u-drop-item" onClick={()=>{setShowChat(true);setUserMenu(false);}}>💬 Mes messages{unread>0&&` (${unread})`}</div>
                <div className="u-drop-item" onClick={()=>{nav('livraison');setUserMenu(false);}}>📦 Mes commandes</div>
                {user.role==='vendeur'&&<div className="u-drop-item" onClick={()=>{nav('vendeur');setUserMenu(false);}}>🏪 Ma boutique</div>}
                <div className="u-drop-sep"/>
                <div className="u-drop-item danger" onClick={logout}>🚪 Déconnexion</div>
              </div>}
            </div>
          </>):(
            <><Btn sm v="glass" onClick={()=>setShowAuth(true)}>Connexion</Btn><Btn sm onClick={()=>nav('vendeur')}>Vendre</Btn></>
          )}
          <button className="hbg" onClick={()=>setMenu(m=>!m)} aria-label="Menu">
            <span style={menu?{transform:'rotate(45deg) translate(5px,5px)'}:{}}/>
            <span style={menu?{opacity:0}:{}}/>
            <span style={menu?{transform:'rotate(-45deg) translate(5px,-5px)'}:{}}/>
          </button>
        </div>
      </div>
    </nav>

    <div className={'mob-menu'+(menu?' open':'')}>
      {LINKS.map(l=><div key={l.id} className={'mob-link'+(page===l.id?' on':'')} onClick={()=>nav(l.id)}>{l.l}</div>)}
      {user?<div className="mob-link" style={{color:'var(--emerald-glow)',borderBottom:'none'}} onClick={()=>{setShowChat(true);setMenu(false);}}>💬 Messages{unread>0&&` (${unread})`}</div>:<div className="mob-link" style={{color:'var(--emerald-glow)',borderBottom:'none'}} onClick={()=>{setShowAuth(true);setMenu(false);}}>🔑 Se connecter</div>}
    </div>

    {page==='accueil'   &&<PageAccueil nav={nav} onBuy={onBuy} products={products} articles={articles} stats={stats}/>}
    {page==='catalogue' &&<PageCatalogue products={products} onBuy={onBuy}/>}
    {page==='blog'      &&<PageBlog articles={articles}/>}
    {page==='livraison' &&<PageLivraison/>}
    {page==='live'      &&<PageLive/>}
    {page==='apropos'   &&<PageAPropos nav={nav}/>}
    {page==='faq'       &&<PageFAQ/>}
    {page==='contact'   &&<PageContact showToast={showToast}/>}
    {page==='cgu'       &&<PageCGU/>}
    {page==='confidentialite'&&<PageConfidentialite/>}
    {page==='vendeur'   &&<PageVendeur user={user} showToast={showToast} setShowAuth={setShowAuth} refreshUser={refreshUser} refreshProducts={refreshProducts}/>}

    <Footer nav={nav}/>

    {/* BOTTOM NAV MOBILE */}
    <div className="bottom-nav">
      <div className="bnav-items">
        {[{id:'accueil',icon:'🏠',l:'Accueil'},{id:'catalogue',icon:'🛍️',l:'Catalogue'},{id:'livraison',icon:'📦',l:'Livraison'},{id:'chat',icon:'💬',l:'Chat'},{id:'profil',icon:'👤',l:'Profil'}].map(b=>(
          <div key={b.id} className={'bnav-item'+(page===b.id?' on':'')} onClick={()=>{
            if(b.id==='chat'){if(user)setShowChat(s=>!s);else setShowAuth(true);}
            else if(b.id==='profil'){if(user)setUserMenu(true);else setShowAuth(true);}
            else nav(b.id);
          }}>
            <div className="bnav-icon">{b.icon}</div>
            <div className="bnav-label">{b.l}</div>
          </div>
        ))}
      </div>
    </div>

    {user&&(
      <button className="chat-fab" onClick={()=>setShowChat(s=>!s)} aria-label="Chat">
        {showChat?'✕':<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
        {!showChat&&unread>0&&<div className="chat-unread" style={{position:'absolute',top:'-4px',right:'-4px',minWidth:'20px',height:'20px',padding:'0 5px',background:'#ef4444',borderRadius:'999px',fontSize:'13px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',border:'2px solid var(--bg-void)',color:'#fff'}}>{unread>9?'9+':unread}</div>}
      </button>
    )}
    {user&&showChat&&<ChatWindow user={user} onClose={()=>setShowChat(false)}/>}

    {toast&&<div className="toast"><span className={toastType==='ok'?'t-ok':'t-err'}>{toastType==='ok'?'✓':'✗'}</span>{toast}</div>}
  </div>);
}

export default App;
