import { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import { supabase } from './lib/supabase';

/* ─ STORAGE (legacy — being migrated to Supabase) ─ */
const ls={
  get:(k,d)=>{try{const v=localStorage.getItem('serao_'+k);return v?JSON.parse(v):d;}catch{return d;}},
  set:(k,v)=>{try{localStorage.setItem('serao_'+k,JSON.stringify(v));}catch{}},
};
let bc; try{bc=new BroadcastChannel('serao_chat');}catch{}

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
const DEF_USERS=[{id:'u1',nom:'Admin SERAO',email:'admin@serao.mg',password:'serao2026',role:'admin',createdAt:'2026-01-01'},{id:'u2',nom:'Vanille de Sava',email:'vanille@sava.mg',password:'vendeur123',role:'vendeur',createdAt:'2026-01-10'},{id:'u3',nom:'Ravo Acheteur',email:'ravo@gmail.com',password:'acheteur123',role:'acheteur',createdAt:'2026-02-01'}];
const DEF_MSGS=[{id:'m1',from:'u2',to:'channel:general',content:'Bienvenue sur SERAO ! Nouvelle vanille premium disponible 🫛',ts:'2026-05-08T08:00:00Z',read:[]},{id:'m2',from:'u3',to:'channel:general',content:'Super ! Quels délais de livraison pour Antananarivo ?',ts:'2026-05-08T08:10:00Z',read:[]},{id:'m3',from:'u2',to:'u3',content:'Bonjour ! 3 jours pour Antananarivo. Je vous prépare une offre spéciale.',ts:'2026-05-08T11:00:00Z',read:['u2']}];
const DEF_PRODUCTS=[{id:1,emoji:'🫛',img:'https://images.unsplash.com/photo-1606471191009-63994c53433b?w=500&q=80&auto=format&fit=crop',badge:'top',cat:'Vanille',region:'SAVA',nom:'Vanille Bourbon Premium',prix:120000,note:4.9,deliv:'3-5 jours'},{id:2,emoji:'🧴',img:'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=500&q=80&auto=format&fit=crop',badge:'spons',cat:'Cosmétiques',region:'Toamasina',nom:'Huile de Baobab Pure',prix:48000,note:4.8,deliv:'3-5 jours'},{id:3,emoji:'🫛',img:'https://images.unsplash.com/photo-1638176067000-9e2c1f3ffb13?w=500&q=80&auto=format&fit=crop',badge:'new',cat:'Vanille',region:'SAVA',nom:'Vanille en Poudre Bio',prix:45000,note:4.7,deliv:'3-5 jours'},{id:4,emoji:'🎨',img:'https://images.unsplash.com/photo-1611348586804-61bf6c080437?w=500&q=80&auto=format&fit=crop',badge:'top',cat:'Artisanat',region:'Antananarivo',nom:'Sculpture Palissandre',prix:250000,note:4.8,deliv:'5-7 jours'},{id:5,emoji:'🌶️',img:'https://images.unsplash.com/photo-1599909366516-6c1f4e2ed0d8?w=500&q=80&auto=format&fit=crop',badge:'top',cat:'Épices',region:'Fianarantsoa',nom:'Poivre Sauvage Voatsiperifery',prix:65000,note:4.9,deliv:'4-6 jours'},{id:6,emoji:'🧵',img:'https://images.unsplash.com/photo-1601925260368-ae2f83cf8b7f?w=500&q=80&auto=format&fit=crop',badge:'top',cat:'Textiles',region:'Ambalavao',nom:'Écharpe Soie Sauvage',prix:185000,note:4.9,deliv:'5-7 jours'},{id:7,emoji:'💎',img:'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80&auto=format&fit=crop',badge:'spons',cat:'Bijoux',region:'Ilakaka',nom:'Saphir Bleu Brut',prix:850000,note:4.8,deliv:'2-3 jours'},{id:8,emoji:'🌶️',img:'https://images.unsplash.com/photo-1584569318686-28b7e48a1f3d?w=500&q=80&auto=format&fit=crop',badge:null,cat:'Épices',region:'Toamasina',nom:'Baie Rose de Madagascar',prix:28000,note:4.6,deliv:'3-5 jours'},{id:9,emoji:'🧴',img:'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&q=80&auto=format&fit=crop',badge:'new',cat:'Cosmétiques',region:'Nosy Be',nom:'Savon Ylang-Ylang',prix:15000,note:4.6,deliv:'3-5 jours'},{id:10,emoji:'🫛',img:'https://images.unsplash.com/photo-1631377306629-0f7e3c4c8fdb?w=500&q=80&auto=format&fit=crop',badge:'spons',cat:'Vanille',region:'SAVA',nom:'Coffret Découverte Vanille',prix:180000,note:5.0,deliv:'3-5 jours'},{id:11,emoji:'🎨',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80&auto=format&fit=crop',badge:'new',cat:'Artisanat',region:'Mahajanga',nom:'Masque Décoratif Sakalava',prix:85000,note:4.7,deliv:'5-7 jours'},{id:12,emoji:'💎',img:'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80&auto=format&fit=crop',badge:null,cat:'Bijoux',region:'Ilakaka',nom:'Bracelet Perles Pierres',prix:75000,note:4.4,deliv:'3-5 jours'}];
const DEF_ARTICLES=[{id:1,min:8,date:'2026-02-15',auteur:'Ravo Andriamahefa',titre:'Top 10 des produits artisanaux malagasy',extrait:"Découvrez les trésors de l'artisanat malgache, des sculptures en palissandre aux tissages en soie sauvage.",tags:['artisanat','guide','culture'],publie:true},{id:2,min:6,date:'2026-02-10',auteur:'Nirina Rakoto',titre:'Pourquoi la vanille de Madagascar est unique',extrait:"La vanille bourbon de Madagascar représente 80% de la production mondiale. Découvrez ce qui la rend si spéciale.",tags:['vanille','agriculture'],publie:true},{id:3,min:5,date:'2026-01-28',auteur:'Fanja Rasoa',titre:'Produits naturels malagasy pour la peau',extrait:"Huile de baobab, beurre de karité... Les secrets beauté de Madagascar.",tags:['cosmétiques','beauté','naturel'],publie:true},{id:4,min:7,date:'2026-01-20',auteur:'Hery Rajoelina',titre:"Reconnaître un artisanat authentique",extrait:"Les clés pour distinguer les véritables créations artisanales des imitations industrielles.",tags:['artisanat','guide'],publie:true}];
const DEF_ORDERS=[{id:'CMD-001',produit:'Vanille Bourbon Premium',client:'Ravo Acheteur',montant:120000,status:'livre',date:'2026-05-01'},{id:'CMD-002',produit:'Huile de Baobab Pure',client:'Marie Rakoto',montant:48000,status:'transit',date:'2026-05-03'},{id:'CMD-003',produit:'Écharpe Soie Sauvage',client:'Pierre Martin',montant:185000,status:'expedie',date:'2026-05-05'}];
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
  const methods=[{id:'mvola',icon:'📱',name:'MVola',color:'#E30913'},{id:'orange',icon:'🟠',name:'Orange Money',color:'#FF6600'},{id:'airtel',icon:'❤️',name:'Airtel Money',color:'#FF0000'}];
  const pay=async()=>{
    if(!method||!phone){showToast('Sélectionnez un moyen de paiement et entrez votre numéro','err');return;}
    setStatus('processing');
    // simulate gateway delay then create real order row in Supabase
    setTimeout(async()=>{
      try{
        const{data,error}=await supabase.from('orders').insert({
          acheteur_id:user?.id,
          product_id:product?.id,
          vendeur_id:product?.vendeur_id||null,
          product_nom:product?.nom||'',
          montant:product?.prix||0,
          pay_method:method,
          pay_tx_ref:'TXN-'+Date.now().toString().slice(-8),
          status:'confirme',
        }).select().single();
        if(error){console.warn('order insert failed',error);showToast('Erreur enregistrement commande','err');setStatus('select');return;}
        setOrderId(data.id);
        setStatus('success');
      }catch(ex){console.warn(ex);setStatus('select');}
    },2200);
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
  const[msgs,setMsgs]=useState(()=>ls.get('messages',DEF_MSGS));
  const[users]=useState(()=>ls.get('users',DEF_USERS));
  const[input,setInput]=useState('');
  const[search,setSearch]=useState('');
  const bottomRef=useRef();
  const inputRef=useRef();

  useEffect(()=>{
    const h=e=>{if(e.data?.type==='new_msg')setMsgs(ls.get('messages',DEF_MSGS));};
    if(bc)bc.addEventListener('message',h);
    return()=>{if(bc)bc.removeEventListener('message',h);};
  },[]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs,active]);

  const threadMsgs=msgs.filter(m=>{
    if(active.type==='channel')return m.to===`channel:${active.id}`;
    return(m.from===user.id&&m.to===active.id)||(m.from===active.id&&m.to===user.id);
  });
  const unread=(target)=>msgs.filter(m=>{
    if(target.type==='channel')return m.to===`channel:${target.id}`&&!(m.read||[]).includes(user.id);
    return m.from===target.id&&m.to===user.id&&!(m.read||[]).includes(user.id);
  }).length;
  const lastMsg=(id,type)=>{
    const ms=msgs.filter(m=>type==='channel'?m.to===`channel:${id}`:(m.from===id&&m.to===user.id)||(m.from===user.id&&m.to===id));
    const l=ms[ms.length-1];return l?l.content.slice(0,28)+(l.content.length>28?'...':''):'';
  };
  const send=()=>{
    if(!input.trim())return;
    const nm={id:'m'+Date.now(),from:user.id,to:active.type==='channel'?`channel:${active.id}`:active.id,content:input.trim(),ts:new Date().toISOString(),read:[user.id]};
    const up=[...msgs,nm];setMsgs(up);ls.set('messages',up);
    if(bc)bc.postMessage({type:'new_msg'});
    setInput('');inputRef.current?.focus();
  };
  const selectConv=t=>{setActive(t);};
  const getUser=id=>users.find(u=>u.id===id)||{nom:'?',id};
  const channels=PUB_CHANNELS.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||!search);
  const dms=users.filter(u=>u.id!==user.id&&(u.nom.toLowerCase().includes(search.toLowerCase())||!search));
  const grouped=[];let lastDay='';
  threadMsgs.forEach(m=>{const day=fmtD(m.ts);if(day!==lastDay){grouped.push({type:'sep',day});lastDay=day;}grouped.push({type:'msg',...m});});

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
          const sender=getUser(item.from);const mine=item.from===user.id;
          return(<div key={item.id} className={'msg-row'+(mine?' mine':'')}>
            {!mine&&<div className="msg-av" style={{background:avColor(sender.nom)}}>{initials(sender.nom)}</div>}
            <div className="msg-bubbles">
              {!mine&&active.type==='channel'&&<div className="msg-sender">{sender.nom}</div>}
              <div className={'bubble '+(mine?'bubble-mine':'bubble-them')}>{item.content}</div>
              <div className="msg-time">{fmtT(item.ts)}{mine&&' ✓✓'}</div>
            </div>
          </div>);
        })}
        <div ref={bottomRef}/>
      </div>
      <div className="chat-input-row">
        <textarea ref={inputRef} className="chat-input" placeholder={`Message ${active.name}...`} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} rows={1}/>
        <button className="chat-send" onClick={send} disabled={!input.trim()}><SendSVG/></button>
      </div>
    </div>
  </div>);
}

/* ─ AUTH MODAL ─ */
function AuthModal({onAuth,onClose}){
  const[tab,setTab]=useState('login');
  const[role,setRole]=useState('acheteur');
  const[f,setF]=useState({nom:'',email:'',password:''});
  const[err,setErr]=useState('');
  const[busy,setBusy]=useState(false);
  const set=(k,v)=>setF(ff=>({...ff,[k]:v}));
  const submit=async e=>{
    e.preventDefault();setErr('');
    if(!f.email||!f.password){setErr('Email et mot de passe requis.');return;}
    setBusy(true);
    try{
      if(tab==='login'){
        const {data,error}=await supabase.auth.signInWithPassword({email:f.email,password:f.password});
        if(error){setErr(error.message==='Invalid login credentials'?'Email ou mot de passe incorrect.':error.message);return;}
        // Fetch profile row (created by trigger on signup)
        const {data:profile}=await supabase.from('profiles').select('*').eq('id',data.user.id).single();
        onAuth({...data.user,...profile});
      }else{
        if(!f.nom){setErr('Nom complet requis.');return;}
        if(f.password.length<6){setErr('Mot de passe : minimum 6 caractères.');return;}
        const {data,error}=await supabase.auth.signUp({
          email:f.email,
          password:f.password,
          options:{data:{nom:f.nom,role}}
        });
        if(error){setErr(error.message);return;}
        if(!data.session){setErr('Vérifie ton email pour confirmer ton inscription.');return;}
        const {data:profile}=await supabase.from('profiles').select('*').eq('id',data.user.id).single();
        onAuth({...data.user,...profile});
      }
    }catch(ex){setErr(ex.message||'Erreur inconnue');}
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
        <Btn type="submit" style={{width:'100%'}} disabled={busy}>{busy?'…':(tab==='login'?'Se connecter →':'Créer mon compte →')}</Btn>
      </form>
    </div>
  </div>);
}

/* ─ ADMIN ─ */
function AdminPanel({onClose,products,setProducts,orders,setOrders}){
  const[tab,setTab]=useState('dash');
  const[modal,setModal]=useState(null);
  const blank={emoji:'🛍️',img:'',badge:'',cat:'',region:'',nom:'',prix:0,note:5.0,deliv:'3-5 jours'};
  const[form,setForm_]=useState(blank);
  const setF=(k,v)=>setForm_(f=>({...f,[k]:v}));
  const msgs=ls.get('messages',DEF_MSGS);
  const users=ls.get('users',DEF_USERS);
  const totalCA=orders.reduce((s,o)=>s+o.montant,0);
  const TABS=[{id:'dash',l:'Dashboard',i:'📊'},{id:'products',l:'Produits',i:'📦'},{id:'orders',l:'Commandes',i:'🚚'},{id:'users',l:'Membres',i:'👥'},{id:'messages',l:'Messages',i:'💬'}];
  const saveProduct=()=>{
    if(!form.nom||!form.cat)return;
    const np=modal==='add'?[...products,{...form,id:Date.now(),prix:Number(form.prix),note:Number(form.note)}]:products.map(p=>p.id===modal?{...form,prix:Number(form.prix),note:Number(form.note)}:p);
    setProducts(np);ls.set('products',np);setModal(null);
  };
  const delProduct=id=>{if(!confirm('Supprimer ?'))return;const np=products.filter(p=>p.id!==id);setProducts(np);ls.set('products',np);};
  const delMsg=id=>{const nm=msgs.filter(m=>m.id!==id);ls.set('messages',nm);};

  return(<div className="admin-panel">
    <div className="admin-side">
      <div className="admin-logo">SERAO<span className="a-badge">ADMIN</span></div>
      <nav className="admin-nav">
        {TABS.map(t=><div key={t.id} className={'a-link'+(tab===t.id?' on':'')} onClick={()=>setTab(t.id)}><span style={{fontSize:'16px'}}>{t.i}</span><span>{t.l}</span></div>)}
      </nav>
      <div className="admin-foot"><div className="admin-close" onClick={onClose}><span style={{fontSize:'16px'}}>←</span><span>Retour</span></div></div>
    </div>
    <div className="admin-main">
      {tab==='dash'&&<div>
        <div className="a-title">Dashboard</div>
        <div className="a-sub">Vue d'ensemble de SERAO</div>
        <div className="stat-grid">
          {[{i:'💰',v:fmt(totalCA),l:'Chiffre d\'affaires',d:'↑ +12%'},{i:'📦',v:orders.length,l:'Commandes',d:'↑ +3 cette semaine'},{i:'🛍️',v:products.length,l:'Produits actifs',d:''},{i:'👥',v:users.length,l:'Membres',d:'↑ +2 ce mois'},{i:'💬',v:msgs.length,l:'Messages',d:''}].map((s,i)=>(
            <div key={i} className="stat-card"><div className="stat-ico">{s.i}</div><div className="stat-val">{s.v}</div><div className="stat-lbl">{s.l}</div>{s.d&&<div className="stat-up">{s.d}</div>}</div>
          ))}
        </div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>ID</th><th>Produit</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.produit}</td><td>{o.client}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(o.montant)}</td><td><span className={'s-pill '+(o.status==='livre'?'s-ok':o.status==='expedie'?'s-ok':'s-warn')}>{o.status}</span></td><td style={{color:'var(--muted)'}}>{o.date}</td></tr>)}</tbody></table></div>
      </div>}

      {tab==='products'&&<div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px'}}>
          <div><div className="a-title">Produits</div><div className="a-sub">{products.length} produits actifs</div></div>
          <Btn onClick={()=>{setForm_(blank);setModal('add');}}>+ Ajouter</Btn>
        </div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th></th><th>Nom</th><th>Catégorie</th><th>Prix</th><th>Badge</th><th>Actions</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td style={{fontSize:'24px'}}>{p.emoji}</td><td style={{fontWeight:600}}>{p.nom}</td><td>{p.cat}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(p.prix)}</td><td>{p.badge?<Badge kind={p.badge}/>:'—'}</td><td><div style={{display:'flex',gap:'6px'}}><Btn sm v="glass" onClick={()=>{setForm_({...p});setModal(p.id);}}>✏️</Btn><Btn sm v="danger" onClick={()=>delProduct(p.id)}>🗑️</Btn></div></td></tr>)}</tbody></table></div>
        {modal&&<div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}><div className="modal">
          <div className="modal-title">{modal==='add'?'Nouveau produit':'Modifier'}</div>
          <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:'12px'}}><div className="fg" style={{marginBottom:0}}><label className="fl">Emoji</label><input className="fi" value={form.emoji} onChange={e=>setF('emoji',e.target.value)}/></div><div className="fg" style={{marginBottom:0}}><label className="fl">Nom</label><input className="fi" value={form.nom} onChange={e=>setF('nom',e.target.value)}/></div></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginTop:'12px'}}>
            <div className="fg"><label className="fl">Catégorie</label><select className="fi" value={form.cat} onChange={e=>setF('cat',e.target.value)}><option value="">—</option>{['Vanille','Artisanat','Épices','Cosmétiques','Textiles','Bijoux'].map(c=><option key={c}>{c}</option>)}</select></div>
            <div className="fg"><label className="fl">Région</label><input className="fi" value={form.region} onChange={e=>setF('region',e.target.value)}/></div>
            <div className="fg"><label className="fl">Prix (Ar)</label><input className="fi" type="number" value={form.prix} onChange={e=>setF('prix',e.target.value)}/></div>
            <div className="fg"><label className="fl">Badge</label><select className="fi" value={form.badge||''} onChange={e=>setF('badge',e.target.value||null)}><option value="">Aucun</option><option value="top">Top vendeur</option><option value="spons">Sponsorisé</option><option value="new">Nouveau</option></select></div>
          </div>
          <div className="fg"><label className="fl">URL Image</label><input className="fi" value={form.img||''} onChange={e=>setF('img',e.target.value)} placeholder="https://..."/></div>
          <div className="modal-foot"><Btn v="glass" onClick={()=>setModal(null)}>Annuler</Btn><Btn onClick={saveProduct}>Enregistrer</Btn></div>
        </div></div>}
      </div>}

      {tab==='orders'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Commandes</div>
        <div className="a-sub">{orders.length} commandes</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>ID</th><th>Produit</th><th>Client</th><th>Montant</th><th>Statut</th><th>Date</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><strong>{o.id}</strong></td><td>{o.produit}</td><td>{o.client}</td><td style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(o.montant)}</td><td><select className="fi" style={{height:'32px',padding:'0 10px',fontSize:'13px',width:'130px',borderRadius:'var(--r-pill)'}} value={o.status} onChange={e=>{const no=orders.map(x=>x.id===o.id?{...x,status:e.target.value}:x);setOrders(no);ls.set('orders',no);}}>{['confirme','preparation','expedie','transit','livre'].map(s=><option key={s}>{s}</option>)}</select></td><td style={{color:'var(--muted)'}}>{o.date}</td></tr>)}</tbody></table></div>
      </div>}

      {tab==='users'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Membres</div>
        <div className="a-sub">{users.length} comptes</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Inscription</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td><div style={{display:'flex',alignItems:'center',gap:'8px'}}><div style={{width:28,height:28,borderRadius:'50%',background:avColor(u.nom),display:'flex',alignItems:'center',justifyContent:'center',fontSize:'13px',fontWeight:700}}>{initials(u.nom)}</div><strong>{u.nom}</strong></div></td><td style={{color:'var(--emerald-glow)'}}>{u.email}</td><td><span className={'s-pill '+(u.role==='admin'?'s-warn':u.role==='vendeur'?'s-ok':'')}>{u.role}</span></td><td style={{color:'var(--muted)'}}>{u.createdAt}</td></tr>)}</tbody></table></div>
      </div>}

      {tab==='messages'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Messages</div>
        <div className="a-sub">{msgs.length} messages</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>De</th><th>Vers</th><th>Message</th><th>Heure</th><th>Action</th></tr></thead><tbody>{[...msgs].reverse().slice(0,20).map(m=>{const sender=users.find(u=>u.id===m.from);const isC=m.to.startsWith('channel:');const target=isC?PUB_CHANNELS.find(c=>`channel:${c.id}`===m.to):users.find(u=>u.id===m.to);return(<tr key={m.id}><td>{sender?.nom||'?'}</td><td style={{color:'var(--emerald-glow)'}}>{isC?target?.name||m.to:target?.nom||m.to}</td><td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.content}</td><td style={{color:'var(--muted)'}}>{fmtT(m.ts)}</td><td><Btn sm v="danger" onClick={()=>delMsg(m.id)}>🗑️</Btn></td></tr>);})}</tbody></table></div>
      </div>}
    </div>
  </div>);
}

/* ─ PAGES ─ */
function PageAccueil({nav,onBuy,products,articles}){
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
            {[{v:'100+',l:'Vendeurs vérifiés'},{v:'2K+',l:'Produits authentiques'},{v:'5K+',l:'Clients satisfaits'},{v:'48h',l:'Livraison max'}].map((s,i)=>(
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

function PageVendeur({showToast}){
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Rejoindre SERAO</h1><p>Inscription ultra-sécurisée · Vérification d'identité · Badge vendeur vérifié</p></div></div>
    <section className="section"><div className="wrap">
      <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:'40px',alignItems:'start'}}>
        <div>
          <h3 style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:700,marginBottom:'20px',background:'linear-gradient(135deg,var(--white),var(--glacier))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Avantages inclus</h3>
          <ul className="avantages">
            {['Accès à des milliers de clients','Estimation IA de vos produits','Diffusion live multiplateforme','Dashboard vendeur complet','Paiement Mobile Money automatique','Support dédié 7j/7','Badge vendeur vérifié','Commission uniquement sur ventes'].map((a,i)=>(
              <li key={i}><div className="av-check">✓</div>{a}</li>
            ))}
          </ul>
        </div>
        <KYCFlow showToast={showToast}/>
      </div>
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
        {[{t:'Marketplace',items:[['catalogue','Catalogue'],['catalogue','Vanille'],['catalogue','Artisanat'],['catalogue','Épices']]},{t:'Services',items:[['livraison','Livraison'],['live','Live Shopping'],['livraison','Points relais'],['vendeur','Devenir vendeur']]},{t:'Infos',items:[['apropos','À propos'],['blog','Blog'],['apropos','Contact'],['apropos','FAQ']]},{t:'Légal',items:[['apropos','Confidentialité'],['apropos','Conditions'],['apropos','Cookies']]}].map(c=>(
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
  const[adminOpen,setAdminOpen]=useState(false);
  const[adminAuth,setAdminAuth]=useState(false);
  const[userMenu,setUserMenu]=useState(false);
  const[payProduct,setPayProduct]=useState(null);
  const[logoClicks,setLogoClicks]=useState(0);
  const logoTimer=useRef(null);
  const userMenuRef=useRef(null);

  const[products,setProducts]=useState([]);
  const[articles]=useState(()=>ls.get('articles',DEF_ARTICLES));
  const[orders,setOrders]=useState([]);

  const nav=p=>{setPage(p);setMenu(false);setUserMenu(false);window.scrollTo({top:0,behavior:'smooth'});};
  const showToast=(msg,type='ok')=>{setToast(msg);setToastType(type);setTimeout(()=>setToast(''),4000);};

  // Helper: fetch the profile row for a given Supabase user
  const fetchProfile=async(authUser)=>{
    if(!authUser)return null;
    const{data}=await supabase.from('profiles').select('*').eq('id',authUser.id).single();
    return data?{...authUser,...data}:authUser;
  };

  // Restore session on load + subscribe to auth changes
  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(async({data:{session}})=>{
      if(!mounted)return;
      if(session?.user){
        const u=await fetchProfile(session.user);
        setUser(u);
      }
      setAuthLoading(false);
    });
    const{data:sub}=supabase.auth.onAuthStateChange(async(_evt,session)=>{
      if(session?.user){const u=await fetchProfile(session.user);setUser(u);}
      else setUser(null);
    });
    return()=>{mounted=false;sub.subscription.unsubscribe();};
  },[]);

  // Load products from Supabase (anyone can read active products via RLS)
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const{data,error}=await supabase
        .from('products')
        .select('*,category:categories(nom,slug,emoji)')
        .eq('active',true)
        .order('created_at',{ascending:false});
      if(!mounted)return;
      if(error){console.warn('products load error',error);return;}
      setProducts((data||[]).map(mapProductRow));
    })();
    return()=>{mounted=false;};
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

  const login=u=>{setUser(u);setShowAuth(false);showToast(`Bienvenue, ${u.nom||u.email} ! 👋`);};
  const logout=async()=>{await supabase.auth.signOut();setUser(null);setShowChat(false);setUserMenu(false);showToast('Déconnecté');};
  const onBuy=p=>{if(user){setPayProduct(p);}else{setShowAuth(true);}};

  useEffect(()=>{
    const h=e=>{if(userMenuRef.current&&!userMenuRef.current.contains(e.target))setUserMenu(false);};
    document.addEventListener('mousedown',h);return()=>document.removeEventListener('mousedown',h);
  },[]);

  const handleLogo=()=>{
    nav('accueil');
    setLogoClicks(n=>{const nx=n+1;clearTimeout(logoTimer.current);logoTimer.current=setTimeout(()=>setLogoClicks(0),2000);if(nx>=5){setLogoClicks(0);setAdminOpen(true);}return nx;});
  };

  const msgs=ls.get('messages',DEF_MSGS);
  const unread=user?msgs.filter(m=>(m.to===user.id||(m.to&&m.to.startsWith('channel:')))&&!(m.read||[]).includes(user.id)).length:0;
  const LINKS=[{id:'accueil',l:'Accueil'},{id:'catalogue',l:'Catalogue'},{id:'blog',l:'Blog'},{id:'livraison',l:'Livraison'},{id:'live',l:'Live'},{id:'apropos',l:'À propos'}];

  if(adminOpen&&adminAuth){
    return(<>
      <AdminPanel onClose={()=>{setAdminOpen(false);setAdminAuth(false);}} products={products} setProducts={setProducts} orders={orders} setOrders={setOrders}/>
      {toast&&<div className="toast"><span className={toastType==='ok'?'t-ok':'t-err'}>{toastType==='ok'?'✓':'✗'}</span>{toast}</div>}
    </>);
  }

  return(<div className="app-root">
    {showAuth&&<AuthModal onAuth={login} onClose={()=>setShowAuth(false)}/>}
    {payProduct&&<PaymentModal product={payProduct} user={user} onClose={()=>{setPayProduct(null);setCart(c=>c+1);}} showToast={showToast}/>}
    {adminOpen&&!adminAuth&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setAdminOpen(false)}}>
        <div className="modal">
          <div className="modal-title">🔐 Accès Admin SERAO</div>
          <form onSubmit={e=>{e.preventDefault();if(e.target.pw.value==='serao2026')setAdminAuth(true);else alert('Mot de passe incorrect');}}>
            <div className="fg"><input name="pw" className="fi" type="password" placeholder="Mot de passe admin" autoFocus/></div>
            <Btn type="submit" style={{width:'100%'}}>Connexion Admin</Btn>
          </form>
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

    {page==='accueil'   &&<PageAccueil nav={nav} onBuy={onBuy} products={products} articles={articles}/>}
    {page==='catalogue' &&<PageCatalogue products={products} onBuy={onBuy}/>}
    {page==='blog'      &&<PageBlog articles={articles}/>}
    {page==='livraison' &&<PageLivraison/>}
    {page==='live'      &&<PageLive/>}
    {page==='apropos'   &&<PageAPropos nav={nav}/>}
    {page==='vendeur'   &&<PageVendeur showToast={showToast}/>}

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
