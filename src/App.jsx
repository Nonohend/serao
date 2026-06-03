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
// Bandeau de valeurs (cf. planche de marque "Glass Malagasy")
const VALEURS=[
  {icon:'🛡️',t:'Confiance',s:'Sûr & fiable'},
  {icon:'🛍️',t:'Commerce Digital',s:'Moderne & accessible'},
  {icon:'🪡',t:'Artisanat Local',s:'Authentique & unique'},
  {icon:'🌿',t:'Durable',s:'Responsable'},
  {icon:'🇲🇬',t:'Fièrement Malagasy',s:'Lokaly, anisy antoky'},
];
// Technologie intégrée (5 piliers)
const TECHS=[
  {icon:'🔒',t:'Plateforme sécurisée',b:['Technologie moderne pour','des transactions fiables']},
  {icon:'📱',t:'Commerce mobile',b:['Expérience fluide','sur tous les appareils']},
  {icon:'📦',t:'Traçabilité locale',b:['Suivi des produits','et soutien aux artisans']},
  {icon:'💳',t:'Paiement sécurisé',b:['Multiples moyens de','paiement Mobile Money']},
  {icon:'☁️',t:'Technologie cloud',b:['Plateforme rapide,','stable et évolutive']},
];

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

/* ─ P2P PAYMENT PANEL ─ */
function P2PPaymentPanel({orderId,product,method,user,showToast,onClose}){
  const[vendorProfile,setVendorProfile]=useState(null);
  const[proofFile,setProofFile]=useState(null);
  const[proofStatus,setProofStatus]=useState('idle'); // idle | uploading | done
  const[rated,setRated]=useState(0);

  useEffect(()=>{
    if(!product?.vendeur_id)return;
    supabase.from('profiles').select('mvola_number,orange_number,airtel_number,tel').eq('id',product.vendeur_id).maybeSingle()
      .then(({data})=>setVendorProfile(data));
  },[product?.vendeur_id]);

  const getVendorPhone=()=>{
    if(!vendorProfile)return null;
    if(method==='mvola')return vendorProfile.mvola_number||vendorProfile.tel||null;
    if(method==='orange')return vendorProfile.orange_number||vendorProfile.tel||null;
    if(method==='airtel')return vendorProfile.airtel_number||vendorProfile.tel||null;
    return vendorProfile.tel||null;
  };

  const uploadProof=async()=>{
    if(!proofFile)return;
    setProofStatus('uploading');
    try{
      const ext=proofFile.name.split('.').pop();
      const path=`${user.id}/proof_${orderId}_${Date.now()}.${ext}`;
      const{error:upErr}=await supabase.storage.from('product-photos').upload(path,proofFile,{contentType:proofFile.type});
      if(upErr)throw upErr;
      const{data}=supabase.storage.from('product-photos').getPublicUrl(path);
      await supabase.rpc('upload_payment_proof',{p_order_id:orderId,p_proof_url:data.publicUrl});
      setProofStatus('done');
      showToast('Preuve envoyée ✓ — En attente du vendeur');
    }catch(ex){showToast(ex.message,'err');setProofStatus('idle');}
  };

  const rate=async(n)=>{
    setRated(n);
    try{await supabase.from('reviews').upsert({product_id:product?.id,auteur_id:user?.id,note:n},{onConflict:'product_id,auteur_id'});}catch{}
  };

  const vendPhone=getVendorPhone();
  const methodName=method==='mvola'?'MVola':method==='orange'?'Orange Money':'Airtel Money';

  return(
    <div className="pay-success">
      <div style={{fontSize:'32px',marginBottom:'8px'}}>📋</div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:800,color:'var(--emerald-glow)',marginBottom:'4px'}}>Commande confirmée !</div>
      <div style={{color:'var(--muted)',fontSize:'14px',marginBottom:'20px'}}>Effectuez votre virement {methodName} au vendeur</div>

      <div style={{background:'var(--glass-emerald)',border:'1px solid var(--glass-border-hi)',borderRadius:'var(--r-lg)',padding:'16px',marginBottom:'16px',textAlign:'left'}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'10px'}}>
          <span style={{color:'var(--muted)',fontSize:'13px'}}>Méthode</span>
          <span style={{fontWeight:700}}>{methodName}</span>
        </div>
        {vendPhone?(
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:'10px'}}>
            <span style={{color:'var(--muted)',fontSize:'13px'}}>Numéro vendeur</span>
            <span style={{fontWeight:700,color:'var(--emerald-glow)',fontSize:'16px'}}>{vendPhone}</span>
          </div>
        ):(
          <div style={{color:'var(--muted)',fontSize:'13px',marginBottom:'10px'}}>Le vendeur vous contactera pour le numéro de paiement.</div>
        )}
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'10px'}}>
          <span style={{color:'var(--muted)',fontSize:'13px'}}>Montant</span>
          <span style={{fontWeight:800,fontSize:'18px',color:'var(--cyan)'}}>{(product?.prix||0).toLocaleString('fr-MG')} Ar</span>
        </div>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{color:'var(--muted)',fontSize:'13px'}}>Référence</span>
          <span style={{fontWeight:700,fontSize:'12px',fontFamily:'monospace',color:'var(--cyan-light)'}}>{orderId}</span>
        </div>
      </div>

      {proofStatus==='idle'&&(
        <div style={{marginBottom:'16px'}}>
          <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'8px'}}>Après avoir payé, uploadez votre capture d'écran :</div>
          <label style={{display:'flex',alignItems:'center',gap:'10px',padding:'12px',border:'2px dashed var(--glass-border-hi)',borderRadius:'var(--r-md)',cursor:'pointer',background:'var(--glass-1)'}}>
            <span style={{fontSize:'24px'}}>📸</span>
            <span style={{fontSize:'13px',color:'var(--muted)'}}>{proofFile?proofFile.name:'Sélectionner la preuve de paiement'}</span>
            <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{setProofFile(e.target.files[0]);e.target.value='';}}/>
          </label>
          {proofFile&&(
            <button onClick={uploadProof} style={{marginTop:'10px',width:'100%',padding:'12px',background:'var(--emerald)',color:'#fff',border:'none',borderRadius:'var(--r-pill)',fontWeight:700,fontSize:'14px',cursor:'pointer'}}>
              Envoyer la preuve ✓
            </button>
          )}
        </div>
      )}
      {proofStatus==='uploading'&&(
        <div style={{padding:'16px',textAlign:'center',color:'var(--muted)',fontSize:'14px',marginBottom:'16px'}}>
          <div className="pay-spinner" style={{margin:'0 auto 12px'}}/>
          Upload en cours...
        </div>
      )}
      {proofStatus==='done'&&(
        <div style={{padding:'14px',background:'rgba(20,123,99,0.15)',border:'1px solid rgba(20,123,99,0.3)',borderRadius:'var(--r-md)',marginBottom:'16px',textAlign:'center'}}>
          <div style={{fontSize:'24px',marginBottom:'6px'}}>⏳</div>
          <div style={{fontWeight:700,color:'var(--emerald-glow)'}}>Preuve envoyée</div>
          <div style={{fontSize:'13px',color:'var(--muted)',marginTop:'4px'}}>En attente de confirmation du vendeur</div>
        </div>
      )}

      <div style={{marginBottom:'16px'}}>
        <div style={{color:'var(--muted)',fontSize:'13px',marginBottom:'8px'}}>Notez ce produit</div>
        <div style={{display:'flex',gap:'8px',justifyContent:'center',fontSize:'28px'}}>
          {[1,2,3,4,5].map(n=>(
            <span key={n} onClick={()=>rate(n)} style={{cursor:'pointer',filter:n<=rated?'none':'grayscale(1)',opacity:n<=rated?1:0.45}}>⭐</span>
          ))}
        </div>
      </div>
      <Btn onClick={onClose} style={{width:'100%'}}>Retour au catalogue</Btn>
    </div>
  );
}

/* ─ PAYMENT MODAL ─ */
function PaymentModal({product, onClose, showToast, user}){
  const[method,setMethod]=useState('');
  const[phone,setPhone]=useState('');
  const[status,setStatus]=useState('select'); // select | processing | success
  const[orderId,setOrderId]=useState(null);
  const[rated,setRated]=useState(0);
  const[geo,setGeo]=useState({lat:null,lng:null,address:'',loading:false,denied:false});
  const methods=[{id:'mvola',icon:'📱',name:'MVola',color:'#E30913'},{id:'orange',icon:'🟠',name:'Orange Money',color:'#FF6600'},{id:'airtel',icon:'❤️',name:'Airtel Money',color:'#FF0000'}];

  // Request geolocation as soon as the modal opens
  useEffect(()=>{
    if(!navigator.geolocation) return;
    setGeo(g=>({...g,loading:true}));
    navigator.geolocation.getCurrentPosition(
      async pos=>{
        const{latitude:lat,longitude:lng}=pos.coords;
        let address='';
        try{
          const r=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,{headers:{'Accept-Language':'fr'}});
          const d=await r.json();
          address=d.display_name||'';
        }catch{}
        setGeo({lat,lng,address,loading:false,denied:false});
      },
      ()=>setGeo(g=>({...g,loading:false,denied:true})),
      {timeout:8000,enableHighAccuracy:true}
    );
  },[]);

  const pay=async()=>{
    if(!method||!phone){showToast('Sélectionnez un moyen de paiement et entrez votre numéro','err');return;}
    setStatus('processing');
    setTimeout(async()=>{
      try{
        const params={p_product_id:product?.id,p_pay_method:method};
        if(geo.lat) Object.assign(params,{p_delivery_lat:geo.lat,p_delivery_lng:geo.lng,p_delivery_address:geo.address});
        const{data,error}=await supabase.rpc('create_order',params);
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
          <div style={{padding:'14px',background:'rgba(20,123,99,0.1)',border:'1px solid rgba(20,123,99,0.2)',borderRadius:'var(--r-md)',marginBottom:'12px',fontSize:'13px',color:'var(--muted)'}}>
            📲 Vous recevrez une demande de confirmation sur votre téléphone. Commission SERAO : 3%.
          </div>
          <div style={{padding:'12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-md)',marginBottom:'20px',fontSize:'13px'}}>
            {geo.loading&&<span style={{color:'var(--muted)'}}>📍 Localisation en cours...</span>}
            {!geo.loading&&geo.lat&&<div><div style={{color:'var(--emerald-glow)',fontWeight:600,marginBottom:'4px'}}>📍 Adresse de livraison détectée</div><div style={{color:'var(--muted)',fontSize:'12px',lineHeight:1.4}}>{geo.address||`${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}`}</div></div>}
            {!geo.loading&&geo.denied&&<span style={{color:'var(--muted)'}}>📍 Localisation non disponible — le vendeur vous contactera pour l'adresse.</span>}
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
          <P2PPaymentPanel
            orderId={orderId}
            product={product}
            method={method}
            user={user}
            showToast={showToast}
            onClose={onClose}
          />
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
function KycPhotoInput({label,file,preview,id,onChange,hint}){
  return(
    <div className="fg">
      <label className="fl">{label}</label>
      {hint&&<div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'8px'}}>{hint}</div>}
      {!preview?(
        <label htmlFor={'kyc-'+id} style={{display:'block',padding:'24px',border:'2px dashed var(--glass-border-hi)',borderRadius:'var(--r-md)',textAlign:'center',cursor:'pointer',background:'var(--glass-1)',transition:'all .2s'}}>
          <div style={{fontSize:'32px',marginBottom:'6px'}}>📷</div>
          <div style={{fontSize:'14px',color:'var(--text)',fontWeight:500}}>Appuyer pour choisir / prendre la photo</div>
          <div style={{fontSize:'12px',color:'var(--muted)',marginTop:'4px'}}>JPG, PNG — 10 Mo max</div>
        </label>
      ):(
        <div style={{position:'relative',borderRadius:'var(--r-md)',overflow:'hidden',border:'2px solid var(--emerald-glow)'}}>
          <img src={preview} alt={label} style={{width:'100%',maxHeight:'220px',objectFit:'cover',display:'block'}}/>
          <div style={{position:'absolute',top:8,right:8,display:'flex',gap:'6px'}}>
            <label htmlFor={'kyc-'+id} style={{padding:'6px 12px',background:'rgba(0,0,0,0.65)',color:'#fff',borderRadius:'var(--r-pill)',fontSize:'12px',fontWeight:600,cursor:'pointer',backdropFilter:'blur(8px)'}}>Changer</label>
            <button type="button" onClick={()=>onChange(null)} style={{padding:'6px 10px',background:'rgba(220,38,38,0.75)',color:'#fff',border:'none',borderRadius:'var(--r-pill)',fontSize:'12px',cursor:'pointer'}}>✕</button>
          </div>
          <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 12px',background:'rgba(0,0,0,0.55)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{color:'var(--emerald-glow)',fontSize:'16px'}}>✓</span>
            <span style={{color:'#fff',fontSize:'13px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file?.name}</span>
          </div>
        </div>
      )}
      <input id={'kyc-'+id} type="file" accept="image/*" capture="environment" style={{display:'none'}} onChange={e=>onChange(e.target.files?.[0]||null)}/>
    </div>
  );
}

function KYCFlow({user,showToast,onDone}){
  const[step,setStep]=useState(0);
  const[busy,setBusy]=useState(false);
  const[form,setForm]=useState({doc_type:'CIN',nin:'',nom_complet:'',date_naissance:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const[rectoFile,setRectoFile]=useState(null);
  const[versoFile,setVersoFile]=useState(null);
  const[selfieFile,setSelfieFile]=useState(null);
  const[rectoPreview,setRectoPreview]=useState(null);
  const[versoPreview,setVersoPreview]=useState(null);
  const[selfiePreview,setSelfiePreview]=useState(null);

  useEffect(()=>{if(!rectoFile){setRectoPreview(null);return;}const u=URL.createObjectURL(rectoFile);setRectoPreview(u);return()=>URL.revokeObjectURL(u);},[rectoFile]);
  useEffect(()=>{if(!versoFile){setVersoPreview(null);return;}const u=URL.createObjectURL(versoFile);setVersoPreview(u);return()=>URL.revokeObjectURL(u);},[versoFile]);
  useEffect(()=>{if(!selfieFile){setSelfiePreview(null);return;}const u=URL.createObjectURL(selfieFile);setSelfiePreview(u);return()=>URL.revokeObjectURL(u);},[selfieFile]);

  const uploadDoc=async(file,type)=>{
    if(file.size>10*1024*1024) throw new Error(`${type} trop lourd (max 10 Mo)`);
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path=`${user.id}/${Date.now()}-${type}.${ext}`;
    const{error}=await withTimeout(
      supabase.storage.from('kyc-documents').upload(path,file,{contentType:file.type,upsert:false}),
      30000,'Upload '+type
    );
    if(error) throw new Error('Upload '+type+' échoué : '+error.message);
    return path;
  };

  const needVerso=form.doc_type==='CIN';
  const canStep0=form.nin.trim().length>=6&&form.nom_complet.trim().length>=3&&form.date_naissance;
  const canStep1=rectoFile&&selfieFile&&(!needVerso||versoFile);

  const submit=async()=>{
    setBusy(true);
    try{
      const rectoPath=await uploadDoc(rectoFile,'recto');
      const versoPath=needVerso?await uploadDoc(versoFile,'verso'):null;
      const selfiePath=await uploadDoc(selfieFile,'selfie');
      const{error}=await withTimeout(
        supabase.rpc('submit_kyc',{
          p_doc_type:form.doc_type,
          p_nin:form.nin.trim(),
          p_nom_complet:form.nom_complet.trim(),
          p_date_naissance:form.date_naissance,
          p_cin_recto_path:rectoPath,
          p_cin_verso_path:versoPath,
          p_selfie_path:selfiePath,
        }),
        15000,'Soumission KYC'
      );
      if(error) throw new Error(error.message);
      setStep(2);
    }catch(ex){showToast(ex.message||'Erreur lors de l\'envoi','err');}
    finally{setBusy(false);}
  };

  const STEPS=['Informations','Documents','Confirmation'];
  return(
    <div className="glass" style={{padding:'36px',maxWidth:'600px',margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
        <div style={{fontSize:'13px',fontWeight:600,color:'var(--muted)'}}>Étape {Math.min(step+1,3)}/{STEPS.length} — {STEPS[Math.min(step,2)]}</div>
        <div style={{fontSize:'12px',color:'var(--emerald-glow)'}}>{step>=2?'100':step===1?'66':'33'}%</div>
      </div>
      <div className="kyc-step-bar">{STEPS.map((_,i)=><div key={i} className={'kyc-step'+(i<step?' done':i===step?' current':'')}/>)}</div>

      {step===0&&(
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'8px',background:'var(--heading-grad)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Vérification d'identité</div>
          <div style={{color:'var(--muted)',fontSize:'14px',marginBottom:'24px',lineHeight:1.6}}>
            Ces informations sont <strong style={{color:'var(--text)'}}>strictement confidentielles</strong> et accessibles uniquement à l'équipe SERAO pour valider votre identité.
          </div>
          <div className="fg">
            <label className="fl">Type de document *</label>
            <select className="fi" value={form.doc_type} onChange={e=>set('doc_type',e.target.value)}>
              <option value="CIN">Carte d'Identité Nationale (CIN)</option>
              <option value="Passeport">Passeport malagasy</option>
              <option value="Permis">Permis de conduire</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Numéro {form.doc_type==='CIN'?'NIN (Numéro d\'Identité Nationale)':'du document'} *</label>
            <input className="fi" value={form.nin} onChange={e=>set('nin',e.target.value.replace(/[^0-9A-Za-z\- ]/g,''))} placeholder={form.doc_type==='CIN'?'Ex : 101 234 567 890':'Numéro figurant sur le document'}/>
            {form.doc_type==='CIN'&&<div style={{fontSize:'12px',color:'var(--muted)',marginTop:'4px'}}>Le NIN se trouve sous la photo au recto de votre CIN malagasy</div>}
          </div>
          <div className="fg">
            <label className="fl">Nom complet (tel qu'il figure sur le document) *</label>
            <input className="fi" value={form.nom_complet} onChange={e=>set('nom_complet',e.target.value)} placeholder="RAKOTO Jean Marie"/>
          </div>
          <div className="fg">
            <label className="fl">Date de naissance *</label>
            <input className="fi" type="date" value={form.date_naissance} onChange={e=>set('date_naissance',e.target.value)} max={new Date().toISOString().slice(0,10)}/>
          </div>
        </div>
      )}

      {step===1&&(
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'8px',background:'var(--heading-grad)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Photos des documents</div>
          <div style={{padding:'14px',background:'var(--glass-emerald)',border:'1px solid rgba(20,123,99,0.3)',borderRadius:'var(--r-md)',fontSize:'13px',marginBottom:'20px',lineHeight:1.7,color:'var(--muted)'}}>
            📸 <strong style={{color:'var(--text)'}}>Conseils :</strong> Bonne lumière, document à plat, entier et lisible. Évitez les reflets sur la plastification.
          </div>
          <KycPhotoInput label={`${form.doc_type} — Recto *`} file={rectoFile} preview={rectoPreview} id="recto" onChange={setRectoFile} hint="Face avant du document, bien cadrée et lisible"/>
          {needVerso&&<KycPhotoInput label="CIN — Verso *" file={versoFile} preview={versoPreview} id="verso" onChange={setVersoFile} hint="Face arrière de la CIN"/>}
          <KycPhotoInput label="Selfie tenant votre document *" file={selfieFile} preview={selfiePreview} id="selfie" onChange={setSelfieFile} hint="Tenez le document face visible à côté de votre visage — les deux doivent être nets"/>
        </div>
      )}

      {step===2&&(
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div style={{fontSize:'64px',marginBottom:'16px'}}>✅</div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'24px',fontWeight:700,marginBottom:'12px',background:'var(--heading-grad)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Demande envoyée !</div>
          <div style={{color:'var(--muted)',fontSize:'15px',lineHeight:1.7,marginBottom:'24px'}}>
            Votre dossier est en cours d'examen par notre équipe.<br/>
            <strong style={{color:'var(--text)'}}>Délai : 24 à 48 heures.</strong><br/>
            Vous pourrez publier des produits dès validation.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',fontSize:'13px',marginBottom:'24px',textAlign:'left'}}>
            {['🔒 Documents sécurisés & chiffrés','⏳ Examen en cours par notre équipe','🔔 Notification par email à la décision','✅ Accès complet après validation'].map((s,i)=>(
              <div key={i} style={{padding:'12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-md)'}}>{s}</div>
            ))}
          </div>
          <Btn onClick={()=>onDone?.()}>Retour à mon espace →</Btn>
        </div>
      )}

      {step<2&&(
        <div style={{display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'28px',paddingTop:'20px',borderTop:'1px solid var(--glass-border)'}}>
          {step>0&&<Btn v="glass" onClick={()=>setStep(s=>s-1)} disabled={busy}>← Retour</Btn>}
          {step===0&&<Btn onClick={()=>{if(canStep0)setStep(1);else showToast('Remplissez tous les champs obligatoires','err');}} disabled={!canStep0}>Suivant →</Btn>}
          {step===1&&<Btn onClick={submit} disabled={!canStep1||busy}>{busy?'Envoi en cours…':'Soumettre mon dossier →'}</Btn>}
        </div>
      )}
    </div>
  );
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
  const lastMsgAt=useRef(null);

  useEffect(()=>{
    const y=window.scrollY;
    document.body.style.position='fixed';
    document.body.style.top=`-${y}px`;
    document.body.style.width='100%';
    return()=>{
      document.body.style.position='';
      document.body.style.top='';
      document.body.style.width='';
      window.scrollTo(0,y);
    };
  },[]);

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
      const initMsgs=m.data||[];
      setMsgs(initMsgs);
      if(initMsgs.length)lastMsgAt.current=initMsgs[initMsgs.length-1].created_at;
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
  // Only fetches messages newer than the last known message — avoids reloading all 500 rows. (BUG 4)
  useEffect(()=>{
    const id=setInterval(async()=>{
      let q=supabase.from('messages').select('*').order('created_at',{ascending:true});
      if(lastMsgAt.current)q=q.gt('created_at',lastMsgAt.current);
      const{data}=await q.limit(50);
      if(data&&data.length>0){
        lastMsgAt.current=data[data.length-1].created_at;
        setMsgs(prev=>{const ids=new Set(prev.map(m=>m.id));return[...prev,...data.filter(m=>!ids.has(m.id))];});
      }
    },5000);
    return()=>clearInterval(id);
  },[]);

  // Message actions
  const[menuFor,setMenuFor]=useState(null); // message id whose menu is open
  const[confirmAction,setConfirmAction]=useState(null);
  const deleteMessage=async(m)=>{
    setMenuFor(null);
    setConfirmAction({message:'Supprimer ce message ?',fn:async()=>{
      const{error}=await supabase.from('messages').delete().eq('id',m.id);
      if(error){console.warn(error);return;}
      setMsgs(prev=>prev.filter(x=>x.id!==m.id));
    }});
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
  // Unread count based on lastseen timestamp — read_by[] is never written server-side. (BUG 3)
  const since=localStorage.getItem('serao_lastseen_'+user.id)||'1970-01-01T00:00:00Z';
  const unread=(target)=>msgs.filter(m=>{
    if(m.from_user===user.id)return false;
    const inTarget=target.type==='channel'?m.channel===target.id:(m.from_user===target.id&&m.to_user===user.id);
    return inTarget&&m.created_at>since;
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
  const selectConv=t=>{
    setActive(t);
    try{localStorage.setItem('serao_lastseen_'+user.id,new Date().toISOString());}catch{}
  };
  const getUser=id=>users.find(u=>u.id===id)||{nom:'?',id};
  const channels=PUB_CHANNELS.filter(c=>c.name.toLowerCase().includes(search.toLowerCase())||!search);
  const dms=users.filter(u=>u.id!==user.id&&((u.nom||'').toLowerCase().includes(search.toLowerCase())||!search));
  const grouped=[];let lastDay='';
  threadMsgs.forEach(m=>{const ts=m.created_at||m.ts;const day=fmtD(ts);if(day!==lastDay){grouped.push({type:'sep',day});lastDay=day;}grouped.push({type:'msg',...m,_ts:ts,_from:m.from_user||m.from});});

  return(<div className="chat-win">
    {confirmAction&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setConfirmAction(null);}}>
        <div className="modal" style={{maxWidth:'400px'}}>
          <div className="modal-title">⚠️ Confirmation</div>
          <p style={{color:'var(--muted)',fontSize:'14px',marginBottom:'20px'}}>{confirmAction.message}</p>
          <div className="modal-foot">
            <Btn v="glass" onClick={()=>setConfirmAction(null)}>Annuler</Btn>
            <Btn v="danger" onClick={async()=>{await confirmAction.fn();setConfirmAction(null);}}>Confirmer</Btn>
          </div>
        </div>
      </div>
    )}
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
        <img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Logo%20SERAO%20.png" alt="SERAO" className="brand-logo-img auth-logo-img" />
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
function AdminPanel({onClose, refreshProducts, showToast}){
  const[tab,setTab]=useState('dash');
  const[products,setProducts]=useState([]);
  const[orders,setOrders]=useState([]);
  const[users,setUsers]=useState([]);
  const[msgs,setMsgs]=useState([]);
  const[adminArticles,setAdminArticles]=useState([]);
  const[kycList,setKycList]=useState([]);
  const[kycSelected,setKycSelected]=useState(null);
  const[kycSignedUrls,setKycSignedUrls]=useState({});
  const[kycRejectMotif,setKycRejectMotif]=useState('');
  const[kycBusy,setKycBusy]=useState(false);
  const[loading,setLoading]=useState(true);
  const[confirmAction,setConfirmAction]=useState(null);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const[p,o,u,m,a,k]=await Promise.all([
      supabase.from('products').select('*,category:categories(nom,slug,emoji)').order('created_at',{ascending:false}),
      supabase.from('orders').select('*').order('created_at',{ascending:false}),
      supabase.rpc('admin_list_users'),
      supabase.from('messages').select('*').order('created_at',{ascending:false}).limit(100),
      supabase.from('articles').select('*').order('created_at',{ascending:false}),
      supabase.rpc('admin_list_kyc'),
    ]);
    setProducts(p.data||[]);
    setOrders(o.data||[]);
    setUsers(u.data||[]);
    setMsgs(m.data||[]);
    setAdminArticles(a.data||[]);
    setKycList(k.data||[]);
    setLoading(false);
  },[]);

  const openKycReview=async(kyc)=>{
    setKycSelected(kyc);setKycRejectMotif('');setKycSignedUrls({});
    const paths={recto:kyc.cin_recto_path,verso:kyc.cin_verso_path,selfie:kyc.selfie_path};
    const urls={};
    await Promise.all(Object.entries(paths).map(async([k,p])=>{
      if(!p)return;
      const{data}=await supabase.storage.from('kyc-documents').createSignedUrl(p,3600);
      if(data?.signedUrl) urls[k]=data.signedUrl;
    }));
    setKycSignedUrls(urls);
  };

  const reviewKyc=async(statut)=>{
    if(statut==='rejete'&&!kycRejectMotif.trim()){showToast?.('Indiquez le motif du rejet','err');return;}
    setKycBusy(true);
    const{error}=await supabase.rpc('admin_review_kyc',{
      p_kyc_id:kycSelected.id,
      p_statut:statut,
      p_motif:statut==='rejete'?kycRejectMotif.trim():null,
    });
    setKycBusy(false);
    if(error){showToast?.(error.message,'err');return;}
    showToast?.(statut==='approuve'?'✅ Dossier approuvé !':'❌ Dossier rejeté');
    setKycSelected(null);
    loadAll();
  };

  useEffect(()=>{loadAll();},[loadAll]);

  const totalCA=orders.reduce((s,o)=>s+Number(o.montant||0),0);
  const kycPending=kycList.filter(k=>k.statut==='en_attente').length;
  const TABS=[{id:'dash',l:'Dashboard',i:'📊'},{id:'products',l:'Produits',i:'📦'},{id:'orders',l:'Commandes',i:'🚚'},{id:'users',l:'Membres',i:'👥'},{id:'kyc',l:'KYC',i:'🪪',badge:kycPending||null},{id:'messages',l:'Messages',i:'💬'},{id:'articles',l:'Articles',i:'📝'}];

  const delProduct=async(p)=>{
    setConfirmAction({message:`Supprimer "${p.nom}" ?`,fn:async()=>{
      const{error}=await supabase.from('products').delete().eq('id',p.id);
      if(error){showToast?.(error.message,'err');return;}
      loadAll();refreshProducts?.();
    }});
  };
  const toggleActive=async(p)=>{
    const{error}=await supabase.from('products').update({active:!p.active}).eq('id',p.id);
    if(error){showToast?.(error.message,'err');return;}
    loadAll();refreshProducts?.();
  };
  const setOrderStatus=async(o,status)=>{
    const{error}=await supabase.from('orders').update({status}).eq('id',o.id);
    if(error){showToast?.(error.message,'err');return;}
    setOrders(orders.map(x=>x.id===o.id?{...x,status}:x));
  };
  const setUserRole=async(u,role)=>{
    const{error}=await supabase.rpc('admin_set_role',{p_user:u.id,p_role:role});
    if(error){showToast?.(error.message,'err');return;}
    setUsers(users.map(x=>x.id===u.id?{...x,role}:x));
  };
  const delMsg=async(m)=>{
    setConfirmAction({message:'Supprimer ce message ?',fn:async()=>{
      const{error}=await supabase.from('messages').delete().eq('id',m.id);
      if(error){showToast?.(error.message,'err');return;}
      setMsgs(msgs.filter(x=>x.id!==m.id));
    }});
  };
  const toggleArticle=async(article)=>{
    const newPublie=!article.publie;
    const{error}=await supabase.from('articles').update({publie:newPublie,publie_at:newPublie?new Date().toISOString():null}).eq('id',article.id);
    if(error){showToast?.(error.message,'err');return;}
    setAdminArticles(adminArticles.map(a=>a.id===article.id?{...a,publie:newPublie}:a));
  };
  const getUser=id=>users.find(u=>u.id===id);

  return(<div className="admin-panel">
    {confirmAction&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setConfirmAction(null);}}>
        <div className="modal" style={{maxWidth:'400px'}}>
          <div className="modal-title">⚠️ Confirmation</div>
          <p style={{color:'var(--muted)',fontSize:'14px',marginBottom:'20px'}}>{confirmAction.message}</p>
          <div className="modal-foot">
            <Btn v="glass" onClick={()=>setConfirmAction(null)}>Annuler</Btn>
            <Btn v="danger" onClick={async()=>{await confirmAction.fn();setConfirmAction(null);}}>Confirmer</Btn>
          </div>
        </div>
      </div>
    )}
    <div className="admin-side">
      <div className="admin-logo">SERAO<span className="a-badge">ADMIN</span></div>
      <nav className="admin-nav">
        {TABS.map(t=><div key={t.id} className={'a-link'+(tab===t.id?' on':'')} onClick={()=>setTab(t.id)}><span style={{fontSize:'16px'}}>{t.i}</span><span>{t.l}</span>{t.badge?<span style={{marginLeft:'auto',background:'#ef4444',color:'#fff',borderRadius:'99px',fontSize:'11px',fontWeight:700,padding:'1px 7px',minWidth:'18px',textAlign:'center'}}>{t.badge}</span>:null}</div>)}
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

      {!loading&&tab==='articles'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Articles</div>
        <div className="a-sub">{adminArticles.length} articles</div>
        <div className="atable-wrap"><table className="atable"><thead><tr><th>Titre</th><th>Statut</th><th>Date</th><th>Action</th></tr></thead><tbody>{adminArticles.map(a=>(<tr key={a.id}><td style={{fontWeight:600}}>{a.titre}</td><td><span className={'s-pill '+(a.publie?'s-ok':'s-err')}>{a.publie?'Publié':'Brouillon'}</span></td><td style={{color:'var(--muted)'}}>{(a.publie_at||a.created_at)?.slice(0,10)||'—'}</td><td><Btn sm v="glass" onClick={()=>toggleArticle(a)}>{a.publie?'Dépublier':'Publier'}</Btn></td></tr>))}</tbody></table></div>
      </div>}

      {!loading&&tab==='kyc'&&<div>
        <div className="a-title" style={{marginBottom:'4px'}}>Vérifications d'identité</div>
        <div className="a-sub">{kycList.length} dossier{kycList.length>1?'s':''} · {kycPending} en attente</div>
        <div className="atable-wrap"><table className="atable">
          <thead><tr><th>Vendeur</th><th>Document</th><th>NIN</th><th>Soumis le</th><th>Statut</th><th>Action</th></tr></thead>
          <tbody>{kycList.map(k=>(
            <tr key={k.id}>
              <td><div style={{fontWeight:600}}>{k.vendeur_nom||'—'}</div><div style={{fontSize:'12px',color:'var(--muted)'}}>{k.vendeur_email}</div></td>
              <td>{k.doc_type}</td>
              <td style={{fontFamily:'monospace',fontSize:'13px'}}>{k.nin||'—'}</td>
              <td style={{color:'var(--muted)'}}>{k.created_at?.slice(0,10)}</td>
              <td><span className={'s-pill '+(k.statut==='approuve'?'s-ok':k.statut==='rejete'?'s-err':'s-warn')}>{k.statut==='approuve'?'Approuvé':k.statut==='rejete'?'Rejeté':'En attente'}</span></td>
              <td><Btn sm v="glass" onClick={()=>openKycReview(k)}>👁 Examiner</Btn></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>}

      {/* KYC Review Modal */}
      {kycSelected&&(
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setKycSelected(null);}}>
          <div className="modal" style={{maxWidth:'780px',width:'95vw'}}>
            <div className="modal-title">🪪 Examen KYC — {kycSelected.vendeur_nom}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px',fontSize:'14px'}}>
              <div><span style={{color:'var(--muted)'}}>Email : </span><strong>{kycSelected.vendeur_email}</strong></div>
              <div><span style={{color:'var(--muted)'}}>Document : </span><strong>{kycSelected.doc_type}</strong></div>
              <div><span style={{color:'var(--muted)'}}>NIN : </span><strong style={{fontFamily:'monospace'}}>{kycSelected.nin||'—'}</strong></div>
              <div><span style={{color:'var(--muted)'}}>Nom déclaré : </span><strong>{kycSelected.nom_complet||'—'}</strong></div>
              <div><span style={{color:'var(--muted)'}}>Date naissance : </span><strong>{kycSelected.date_naissance||'—'}</strong></div>
              <div><span style={{color:'var(--muted)'}}>Soumis le : </span><strong>{kycSelected.created_at?.slice(0,10)}</strong></div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'12px',marginBottom:'20px'}}>
              {[{key:'recto',label:`${kycSelected.doc_type} Recto`},{key:'verso',label:'CIN Verso'},{key:'selfie',label:'Selfie'}].map(({key,label})=>(
                kycSignedUrls[key]?(
                  <div key={key} style={{borderRadius:'var(--r-md)',overflow:'hidden',border:'1px solid var(--glass-border)'}}>
                    <div style={{padding:'8px 12px',background:'var(--glass-1)',fontSize:'12px',fontWeight:600,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>{label}</div>
                    <a href={kycSignedUrls[key]} target="_blank" rel="noreferrer">
                      <img src={kycSignedUrls[key]} alt={label} style={{width:'100%',height:'180px',objectFit:'cover',display:'block'}}/>
                    </a>
                  </div>
                ):(
                  kycSelected[key==='recto'?'cin_recto_path':key==='verso'?'cin_verso_path':'selfie_path']?(
                    <div key={key} style={{borderRadius:'var(--r-md)',border:'1px solid var(--glass-border)',padding:'24px',textAlign:'center',color:'var(--muted)',fontSize:'13px'}}>
                      <div style={{fontSize:'24px',marginBottom:'8px'}}>⏳</div>Chargement…
                    </div>
                  ):null
                )
              ))}
            </div>

            {kycSelected.statut==='en_attente'&&(
              <div>
                <div style={{marginBottom:'12px'}}>
                  <label className="fl">Motif de rejet (requis si rejet)</label>
                  <textarea className="fi" rows="2" value={kycRejectMotif} onChange={e=>setKycRejectMotif(e.target.value)} placeholder="Ex : Photo illisible, document expiré, nom ne correspond pas…"/>
                </div>
                <div className="modal-foot">
                  <Btn v="glass" onClick={()=>setKycSelected(null)}>Fermer</Btn>
                  <Btn v="danger" onClick={()=>reviewKyc('rejete')} disabled={kycBusy}>❌ Rejeter</Btn>
                  <Btn onClick={()=>reviewKyc('approuve')} disabled={kycBusy}>✅ Approuver</Btn>
                </div>
              </div>
            )}
            {kycSelected.statut!=='en_attente'&&(
              <div>
                {kycSelected.motif_rejet&&<div style={{padding:'12px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'var(--r-md)',fontSize:'14px',marginBottom:'16px',color:'#fca5a5'}}>Motif : {kycSelected.motif_rejet}</div>}
                <div className="modal-foot"><Btn v="glass" onClick={()=>setKycSelected(null)}>Fermer</Btn></div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>);
}

/* ─ PAGES ─ */
function PageAccueil({nav,onBuy,products,articles,stats}){
  const videoRef=useRef(null);

  // Make body transparent so the fixed video shows through
  useEffect(()=>{
    document.body.classList.add('has-video-bg');
    return()=>document.body.classList.remove('has-video-bg');
  },[]);

  // Scroll-driven scrubbing: map scrollY → video.currentTime over the full page
  useEffect(()=>{
    const video=videoRef.current;
    if(!video)return;
    // Force the browser to download the whole file so scrubbing is frame-accurate.
    // play() triggers aggressive buffering; we immediately pause to keep it silent.
    video.play().then(()=>video.pause()).catch(()=>{});
    let raf;
    const tick=()=>{
      if(!video.duration)return;
      const maxScroll=document.documentElement.scrollHeight-window.innerHeight;
      if(maxScroll<=0)return;
      video.currentTime=Math.min(1,Math.max(0,window.scrollY/maxScroll))*video.duration;
    };
    const onScroll=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);};
    window.addEventListener('scroll',onScroll,{passive:true});
    video.addEventListener('loadedmetadata',tick,{once:true});
    tick();
    return()=>{window.removeEventListener('scroll',onScroll);cancelAnimationFrame(raf);};
  },[]);

  const compact=n=>{n=Number(n)||0;if(n>=1000)return (n/1000).toFixed(n>=10000?0:1).replace('.0','')+'K';return String(n);};
  const heroStats=[
    {v:stats?compact(stats.vendeurs):'—',l:'Vendeurs actifs'},
    {v:stats?compact(stats.produits):'—',l:'Produits en ligne'},
    {v:stats?compact(stats.membres):'—',l:'Membres inscrits'},
    {v:'48h',l:'Livraison max'},
  ];
  return(<>
    {/* Scroll-driven video background — scrubs frame-by-frame as user scrolls */}
    <video ref={videoRef} className="accueil-video-bg" aria-hidden="true"
      src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/hero-bg.mp4.mp4"
      muted playsInline preload="auto"/>
    <div className="accueil-video-overlay" aria-hidden="true"/>

    <section className="hero">
      <div className="wrap" style={{width:'100%'}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}>
          <div className="hero-eye"><div className="hero-eye-dot"/><span>Marketplace Malagasy · Produits Authentiques</span></div>
          <img
            src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Logo%20SERAO%20.png"
            alt="SERAO"
            className="hero-logo-img"
            draggable={false}
          />
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
        <div className="glass values-band">
          {VALEURS.map((v,i)=>(
            <div key={i} className="value-item">
              <div className="value-ic">{v.icon}</div>
              <div className="value-tx"><div className="value-t">{v.t}</div><div className="value-s">{v.s}</div></div>
            </div>
          ))}
        </div>
      </div>
    </section>

    <section className="section" style={{paddingTop:0}}>
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
        <div className="sec-top"><div><span className="sec-eye">Technologie intégrée</span><h2 className="sec-h">Une base solide & moderne</h2></div></div>
        <div className="tech-grid">{TECHS.map((t,i)=>(
          <div key={i} className="glass tech-card">
            <div className="tech-ic">{t.icon}</div>
            <div className="tech-t">{t.t}</div>
            <div className="tech-b">{t.b.map((line,j)=><span key={j}>{line}</span>)}</div>
          </div>
        ))}</div>
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
            <div style={{color:'var(--emerald-glow)',fontWeight:600,marginBottom:'4px'}}>{l.prix}</div>
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

function PageContact({showToast,user}){
  const[f,setF]=useState({nom:'',email:'',msg:''});
  const set=(k,v)=>setF(ff=>({...ff,[k]:v}));
  const submit=async e=>{
    e.preventDefault();
    if(!f.nom||!f.email||!f.msg){showToast('Remplis tous les champs','err');return;}
    if(user){
      try{await supabase.from('messages').insert({from_user:user.id,channel:'contact',content:`[${f.nom} — ${f.email}] ${f.msg}`});}
      catch(ex){console.warn('contact send failed',ex);}
    }
    showToast('Message envoyé ✓ Nous te répondrons vite.');
    setF({nom:'',email:'',msg:''});
  };
  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Contact</h1><p>Une question, un partenariat, un souci ? Écris-nous.</p></div></div>
    <section className="section"><div className="wrap" style={{maxWidth:'600px'}}>
      <div className="glass" style={{padding:'28px',borderRadius:'var(--r-xl)',marginBottom:'20px',display:'grid',gap:'10px',fontSize:'14px',color:'var(--muted)'}}>
        <div>📧 <a href="mailto:nohannsamby@gmail.com" style={{color:'var(--text)',textDecoration:'none'}}><strong>nohannsamby@gmail.com</strong></a></div>
        <div>💬 <a href="https://wa.me/261381714548" target="_blank" rel="noopener noreferrer" style={{color:'var(--text)',textDecoration:'none'}}><strong>WhatsApp : +261 38 171 45 48</strong></a></div>
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

/* ─ STAR RATING ─ */
function StarRating({value=0,max=5,size=18,onChange=null,count=null}){
  const [hover,setHover]=useState(0);
  const v=hover||Math.round(value);
  return(
    <div style={{display:'flex',alignItems:'center',gap:'3px'}}>
      {Array.from({length:max},(_,i)=>(
        <span key={i}
          onClick={()=>onChange&&onChange(i+1)}
          onMouseEnter={()=>onChange&&setHover(i+1)}
          onMouseLeave={()=>setHover(0)}
          style={{fontSize:size,cursor:onChange?'pointer':'default',color:i<v?'#f59e0b':'rgba(255,255,255,0.15)',transition:'transform .1s, color .1s',display:'inline-block',transform:onChange&&hover===i+1?'scale(1.25)':'scale(1)',lineHeight:1}}
        >★</span>
      ))}
      {count!==null&&<span style={{fontSize:13,color:'var(--muted)',marginLeft:5}}>{count>0?`${Number(value).toFixed(1)} (${count})`:count===0?'Pas encore noté':''}</span>}
    </div>
  );
}

/* ─ PAGE PROFIL ─ */
function PageProfil({user,showToast,refreshUser,nav}){
  const[profile,setProfile]=useState(null);
  const[ratings,setRatings]=useState([]);
  const[products,setProducts]=useState([]);
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({});
  const[avatarFile,setAvatarFile]=useState(null);
  const[bannerFile,setBannerFile]=useState(null);
  const[busy,setBusy]=useState(false);
  const[ratingForm,setRatingForm]=useState({show:false,targetId:null,targetNom:'',note:0,commentaire:''});
  const setF=(k,v)=>setForm(f=>({...f,[k]:v}));

  const load=useCallback(async()=>{
    if(!user)return;
    const[p,r,pr]=await Promise.all([
      supabase.rpc('get_public_profile',{p_user_id:user.id}).maybeSingle(),
      supabase.from('user_ratings').select('*').eq('evalue_id',user.id).order('created_at',{ascending:false}).limit(20),
      supabase.from('products').select('*,category:categories(nom)').eq('vendeur_id',user.id).eq('active',true).order('created_at',{ascending:false}).limit(8),
    ]);
    if(p.data)setProfile(p.data);
    setRatings(r.data||[]);
    setProducts(pr.data||[]);
  },[user]);

  useEffect(()=>{load();},[load]);

  const startEdit=()=>{
    setForm({
      nom:profile?.nom||'',bio:profile?.bio||'',region:profile?.region||'',tel:'',
      shop_name:profile?.shop_name||'',shop_description:profile?.shop_description||'',
      mvola_number:profile?.mvola_number||'',orange_number:profile?.orange_number||'',airtel_number:profile?.airtel_number||'',
    });
    setEditing(true);
  };

  const save=async()=>{
    setBusy(true);
    try{
      let avatar_url=profile?.avatar_url;
      let shop_banner_url=profile?.shop_banner_url;

      if(avatarFile){
        const ext=avatarFile.name.split('.').pop();
        const path=`${user.id}/avatar_${Date.now()}.${ext}`;
        const{error:e}=await supabase.storage.from('product-photos').upload(path,avatarFile,{contentType:avatarFile.type});
        if(e){showToast('Upload avatar échoué : '+e.message,'err');setBusy(false);return;}
        const{data}=supabase.storage.from('product-photos').getPublicUrl(path);
        avatar_url=data.publicUrl;
      }
      if(bannerFile){
        const ext=bannerFile.name.split('.').pop();
        const path=`${user.id}/banner_${Date.now()}.${ext}`;
        const{error:e}=await supabase.storage.from('product-photos').upload(path,bannerFile,{contentType:bannerFile.type});
        if(e){showToast('Upload bannière échoué : '+e.message,'err');setBusy(false);return;}
        const{data}=supabase.storage.from('product-photos').getPublicUrl(path);
        shop_banner_url=data.publicUrl;
      }

      const updates={nom:form.nom,bio:form.bio,region:form.region,avatar_url,shop_name:form.shop_name,shop_description:form.shop_description,shop_banner_url,mvola_number:form.mvola_number,orange_number:form.orange_number,airtel_number:form.airtel_number,updated_at:new Date().toISOString()};
      const{error}=await supabase.from('profiles').update(updates).eq('id',user.id);
      if(error)throw error;
      if(form.tel){await supabase.from('profiles').update({tel:form.tel}).eq('id',user.id);}
      setProfile(p=>({...p,...updates}));
      showToast('Profil mis à jour ✓');
      setEditing(false);
      setAvatarFile(null);setBannerFile(null);
      await load();
      refreshUser?.();
    }catch(ex){showToast(ex.message,'err');}
    finally{setBusy(false);}
  };

  const submitRating=async()=>{
    if(!ratingForm.note){showToast('Sélectionne une note','err');return;}
    const{error}=await supabase.rpc('submit_user_rating',{p_evalue_id:ratingForm.targetId,p_note:ratingForm.note,p_commentaire:ratingForm.commentaire||null});
    if(error){showToast(error.message,'err');return;}
    showToast('Note envoyée ✓');
    setRatingForm({show:false,targetId:null,targetNom:'',note:0,commentaire:''});
    await load();
  };

  if(!user)return(<div className="page-hero"><div className="wrap"><h1>Profil</h1><p>Connectez-vous pour accéder à votre profil.</p></div></div>);
  if(!profile)return(<div style={{textAlign:'center',padding:'60px',color:'var(--muted)'}}>Chargement...</div>);

  const isVendeur=profile.role==='vendeur';
  const avatarPreview=avatarFile?URL.createObjectURL(avatarFile):profile.avatar_url;
  const bannerPreview=bannerFile?URL.createObjectURL(bannerFile):profile.shop_banner_url;

  return(
    <div>
      {/* Banner */}
      <div style={{height:'180px',background:bannerPreview?`url(${bannerPreview}) center/cover`:'linear-gradient(135deg,rgba(20,123,99,0.4),rgba(6,214,176,0.1))',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(to bottom,transparent 60%,rgba(6,10,16,0.9))'}}/>
        {editing&&isVendeur&&<label style={{position:'absolute',bottom:12,right:16,background:'rgba(0,0,0,0.6)',color:'#fff',padding:'6px 14px',borderRadius:'var(--r-pill)',fontSize:'13px',cursor:'pointer',backdropFilter:'blur(8px)'}}>📷 Bannière<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{setBannerFile(e.target.files[0]);e.target.value='';}}/></label>}
      </div>

      <section className="section" style={{paddingTop:0}}>
        <div className="wrap" style={{maxWidth:'720px'}}>
          {/* Avatar + infos */}
          <div style={{display:'flex',alignItems:'flex-end',gap:'20px',marginTop:'-56px',marginBottom:'24px',flexWrap:'wrap'}}>
            <div style={{position:'relative',flexShrink:0}}>
              <div style={{width:100,height:100,borderRadius:'50%',background:avColor(profile.nom||'?'),border:'4px solid rgba(6,10,16,1)',overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'36px',fontWeight:700}}>
                {avatarPreview?<img src={avatarPreview} alt={profile.nom} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:initials(profile.nom||'?')}
              </div>
              {editing&&<label style={{position:'absolute',bottom:0,right:0,width:28,height:28,background:'var(--emerald)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',border:'2px solid rgba(6,10,16,1)',fontSize:'14px'}}>📷<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{setAvatarFile(e.target.files[0]);e.target.value='';}}/></label>}
            </div>
            <div style={{flex:1,minWidth:'200px',paddingBottom:'8px'}}>
              {editing?(
                <input className="fi" value={form.nom} onChange={e=>setF('nom',e.target.value)} style={{fontSize:'20px',fontWeight:700,marginBottom:'8px'}} placeholder="Votre nom"/>
              ):(
                <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:700,marginBottom:'4px'}}>{profile.nom}</div>
              )}
              <div style={{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'}}>
                <span style={{padding:'3px 10px',borderRadius:'999px',fontSize:'12px',fontWeight:700,background:'var(--glass-emerald)',color:'var(--emerald-glow)',border:'1px solid rgba(20,123,99,0.3)'}}>{profile.role}</span>
                {profile.region&&<span style={{fontSize:'13px',color:'var(--muted)'}}>📍 {profile.region}</span>}
                {profile.verified&&<span style={{fontSize:'12px',color:'var(--emerald-glow)'}}>✅ Vérifié</span>}
              </div>
              {profile.rating_count>0&&<div style={{marginTop:'6px'}}><StarRating value={profile.rating_avg} count={profile.rating_count} size={16}/></div>}
            </div>
            {!editing&&<Btn sm v="glass" onClick={startEdit}>✏️ Modifier</Btn>}
          </div>

          {editing?(
            <div className="glass" style={{padding:'24px',borderRadius:'var(--r-xl)',marginBottom:'24px'}}>
              <div style={{display:'grid',gap:'16px'}}>
                <div className="fg"><label className="fl">Bio</label><textarea className="fi" rows="3" value={form.bio} onChange={e=>setF('bio',e.target.value)} placeholder="Parlez de vous..."/></div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                  <div className="fg"><label className="fl">Région</label><input className="fi" value={form.region} onChange={e=>setF('region',e.target.value)} placeholder="ex: Antananarivo"/></div>
                  <div className="fg"><label className="fl">Téléphone</label><input className="fi" value={form.tel} onChange={e=>setF('tel',e.target.value)} placeholder="+261 34..."/></div>
                </div>
                <div style={{borderTop:'1px solid var(--glass-border)',paddingTop:'16px',fontWeight:700,color:'var(--text)',fontSize:'15px'}}>💳 Numéros de paiement Mobile Money</div>
                <div className="fg"><label className="fl">Numéro MVola</label><input className="fi" placeholder="034 XX XXX XX" value={form.mvola_number||''} onChange={e=>setF('mvola_number',e.target.value)}/></div>
                <div className="fg"><label className="fl">Numéro Orange Money</label><input className="fi" placeholder="032 XX XXX XX" value={form.orange_number||''} onChange={e=>setF('orange_number',e.target.value)}/></div>
                <div className="fg"><label className="fl">Numéro Airtel Money</label><input className="fi" placeholder="033 XX XXX XX" value={form.airtel_number||''} onChange={e=>setF('airtel_number',e.target.value)}/></div>
                {isVendeur&&<>
                  <div style={{borderTop:'1px solid var(--glass-border)',paddingTop:'16px',fontWeight:700,color:'var(--text)',fontSize:'15px'}}>🏪 Ma boutique</div>
                  <div className="fg"><label className="fl">Nom de la boutique</label><input className="fi" value={form.shop_name} onChange={e=>setF('shop_name',e.target.value)} placeholder="ex: Vanille de Sava"/></div>
                  <div className="fg"><label className="fl">Description</label><textarea className="fi" rows="3" value={form.shop_description} onChange={e=>setF('shop_description',e.target.value)} placeholder="Décrivez votre boutique..."/></div>
                </>}
              </div>
              <div className="modal-foot" style={{marginTop:'20px',paddingTop:'16px',borderTop:'1px solid var(--glass-border)'}}>
                <Btn v="glass" onClick={()=>setEditing(false)} disabled={busy}>Annuler</Btn>
                <Btn onClick={save} disabled={busy}>{busy?'Enregistrement...':'Sauvegarder'}</Btn>
              </div>
            </div>
          ):(
            <>
              {profile.bio&&<div className="glass" style={{padding:'16px',borderRadius:'var(--r-lg)',marginBottom:'20px',fontSize:'14px',color:'var(--muted)',lineHeight:1.6}}>{profile.bio}</div>}
              {isVendeur&&profile.shop_name&&(
                <div className="glass" style={{padding:'20px',borderRadius:'var(--r-xl)',marginBottom:'20px'}}>
                  <div style={{fontWeight:700,fontSize:'16px',marginBottom:'6px'}}>🏪 {profile.shop_name}</div>
                  {profile.shop_description&&<div style={{fontSize:'14px',color:'var(--muted)',lineHeight:1.6}}>{profile.shop_description}</div>}
                </div>
              )}
            </>
          )}

          {/* Produits du vendeur */}
          {isVendeur&&products.length>0&&!editing&&(
            <div style={{marginBottom:'28px'}}>
              <h3 className="sec-h" style={{fontSize:'18px',marginBottom:'16px'}}>Mes produits</h3>
              <div className="pgrid" style={{gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))'}}>
                {products.map(p=>(
                  <article key={p.id} className="pcard" style={{cursor:'default'}}>
                    <div className="pcard-img">{p.image_url?<img src={p.image_url} alt={p.nom} className="pcard-photo" loading="lazy"/>:<div className="pcard-emo">{p.emoji}</div>}</div>
                    <div className="pcard-body">
                      <div className="pcard-meta">{p.category?.nom||''}</div>
                      <div className="pcard-name">{p.nom}</div>
                      <div className="pcard-price">{fmt(p.prix)}</div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* Notes reçues */}
          {!editing&&(
            <div>
              <h3 className="sec-h" style={{fontSize:'18px',marginBottom:'16px'}}>Avis reçus ({ratings.length})</h3>
              {ratings.length===0&&<div className="glass" style={{padding:'28px',textAlign:'center',color:'var(--muted)',fontSize:'14px',borderRadius:'var(--r-xl)'}}>Aucun avis pour l'instant.</div>}
              {ratings.map(r=>(
                <div key={r.id} className="glass" style={{padding:'14px',borderRadius:'var(--r-lg)',marginBottom:'10px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                    <StarRating value={r.note} size={15}/>
                    <span style={{fontSize:'12px',color:'var(--muted)'}}>{r.created_at?.slice(0,10)} · {r.context}</span>
                  </div>
                  {r.commentaire&&<div style={{fontSize:'14px',color:'var(--muted)',lineHeight:1.5}}>{r.commentaire}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Modal notation */}
      {ratingForm.show&&(
        <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setRatingForm(f=>({...f,show:false}));}}>
          <div className="modal" style={{maxWidth:'400px'}}>
            <div className="modal-title">⭐ Noter {ratingForm.targetNom}</div>
            <div style={{marginBottom:'20px',textAlign:'center'}}><StarRating value={ratingForm.note} size={36} onChange={n=>setRatingForm(f=>({...f,note:n}))}/></div>
            <div className="fg"><label className="fl">Commentaire (optionnel)</label><textarea className="fi" rows="3" value={ratingForm.commentaire} onChange={e=>setRatingForm(f=>({...f,commentaire:e.target.value}))} placeholder="Votre avis..."/></div>
            <div className="modal-foot">
              <Btn v="glass" onClick={()=>setRatingForm(f=>({...f,show:false}))}>Annuler</Btn>
              <Btn onClick={submitRating}>Envoyer</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─ PAGE MESSAGES (Messenger-style) ─ */
function PageMessages({user,showToast}){
  const[active,setActive]=useState({type:'channel',id:'general',name:'# Général',sub:'Discussion générale'});
  const[mobileView,setMobileView]=useState('list'); // 'list' | 'conv'
  const[msgs,setMsgs]=useState([]);
  const[users,setUsers]=useState([]);
  const[input,setInput]=useState('');
  const[search,setSearch]=useState('');
  const[sending,setSending]=useState(false);
  const[menuFor,setMenuFor]=useState(null);
  const[mediaFile,setMediaFile]=useState(null);
  const[mediaPreview,setMediaPreview]=useState(null);
  const bottomRef=useRef();
  const inputRef=useRef();
  const lastMsgAt=useRef(null);

  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const[p,m]=await Promise.all([
        supabase.from('profiles').select('id,nom,role'),
        supabase.from('messages').select('*').order('created_at',{ascending:true}).limit(500),
      ]);
      if(!mounted)return;
      setUsers(p.data||[]);
      const init=m.data||[];
      setMsgs(init);
      if(init.length)lastMsgAt.current=init[init.length-1].created_at;
    })();
    return()=>{mounted=false;};
  },[]);

  useEffect(()=>{
    const ch=supabase.channel('serao-msgs-page')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},p=>{
        setMsgs(prev=>prev.some(m=>m.id===p.new.id)?prev:[...prev,p.new]);
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},p=>{
        setMsgs(prev=>prev.filter(m=>m.id!==p.old.id));
      })
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

  useEffect(()=>{
    const id=setInterval(async()=>{
      let q=supabase.from('messages').select('*').order('created_at',{ascending:true});
      if(lastMsgAt.current)q=q.gt('created_at',lastMsgAt.current);
      const{data}=await q.limit(50);
      if(data?.length){lastMsgAt.current=data[data.length-1].created_at;setMsgs(prev=>{const ids=new Set(prev.map(m=>m.id));return[...prev,...data.filter(m=>!ids.has(m.id))];});}
    },5000);
    return()=>clearInterval(id);
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs,active]);

  const threadMsgs=msgs.filter(m=>active.type==='channel'?m.channel===active.id:(m.from_user===user?.id&&m.to_user===active.id)||(m.from_user===active.id&&m.to_user===user?.id));
  const since=localStorage.getItem('serao_lastseen_'+user?.id)||'1970-01-01T00:00:00Z';
  const unread=(target)=>msgs.filter(m=>{
    if(m.from_user===user?.id)return false;
    const inT=target.type==='channel'?m.channel===target.id:(m.from_user===target.id&&m.to_user===user?.id);
    return inT&&m.created_at>since;
  }).length;
  const lastMsg=(id,type)=>{
    const ms=msgs.filter(m=>type==='channel'?m.channel===id:(m.from_user===id&&m.to_user===user?.id)||(m.from_user===user?.id&&m.to_user===id));
    const l=ms[ms.length-1];return l?l.content.slice(0,32)+(l.content.length>32?'…':''):'';
  };

  const send=async()=>{
    if((!input.trim()&&!mediaFile)||sending||!user)return;
    setSending(true);
    let content=input.trim();
    if(mediaFile){
      const ext=mediaFile.name.split('.').pop();
      const path=`chat/${user.id}/${Date.now()}.${ext}`;
      const{error:upErr}=await supabase.storage.from('product-photos').upload(path,mediaFile,{contentType:mediaFile.type});
      if(!upErr){
        const{data}=supabase.storage.from('product-photos').getPublicUrl(path);
        content=JSON.stringify({_t:'media',url:data.publicUrl,mime:mediaFile.type,text:content||undefined});
      }
      setMediaFile(null);setMediaPreview(null);
    }
    setInput('');
    const payload={from_user:user.id,content,...(active.type==='channel'?{channel:active.id,to_user:null}:{to_user:active.id,channel:null})};
    const{error}=await supabase.from('messages').insert(payload);
    if(error&&!mediaFile){setInput(content);}
    setSending(false);
    inputRef.current?.focus();
  };

  const selectConv=t=>{
    setActive(t);
    setMobileView('conv');
    try{localStorage.setItem('serao_lastseen_'+user?.id,new Date().toISOString());}catch{}
  };

  const getUser=id=>users.find(u=>u.id===id)||{nom:'?',id};
  const channels=PUB_CHANNELS.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase()));
  const dms=users.filter(u=>u.id!==user?.id&&(!search||u.nom?.toLowerCase().includes(search.toLowerCase())));

  // Group messages by sender for Messenger-like display
  const grouped=[];let lastDay='',lastFrom='';
  threadMsgs.forEach(m=>{
    const ts=m.created_at||m.ts;
    const day=fmtD(ts);
    if(day!==lastDay){grouped.push({type:'sep',day});lastDay=day;lastFrom='';}
    grouped.push({type:'msg',...m,_ts:ts,_from:m.from_user||m.from,_showAv:lastFrom!==(m.from_user||m.from)});
    lastFrom=m.from_user||m.from;
  });

  if(!user)return(<div className="page-hero"><div className="wrap"><h1>Messages</h1><p>Connectez-vous pour accéder aux messages.</p></div></div>);

  return(
    <div className="msg-page">
      {/* Sidebar */}
      <div className={`msg-sidebar${mobileView==='conv'?' msg-mob-hidden':''}`}>
        <div className="msg-sidebar-head">
          <div className="msg-sidebar-title">Messages</div>
          <input className="chat-search" placeholder="Rechercher..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className="msg-convlist">
          {channels.length>0&&<>
            <div className="chat-sec-label">Canaux publics</div>
            {channels.map(c=>{
              const t={type:'channel',id:c.id,name:c.name,sub:c.desc};
              const u=unread(t);
              return(
                <div key={c.id} className={`msg-conv-item${active.id===c.id&&active.type==='channel'?' on':''}`} onClick={()=>selectConv(t)}>
                  <div className="msg-conv-av" style={{background:'var(--glass-emerald)',fontSize:'18px'}}>{c.icon}</div>
                  <div className="msg-conv-info">
                    <div className="msg-conv-name">{c.name}</div>
                    <div className="msg-conv-prev">{lastMsg(c.id,'channel')||c.desc}</div>
                  </div>
                  {u>0&&<div className="msg-conv-badge">{u}</div>}
                </div>
              );
            })}
          </>}
          {dms.length>0&&<>
            <div className="chat-sec-label">Messages directs</div>
            {dms.map(u=>{
              const t={type:'dm',id:u.id,name:u.nom,sub:u.role};
              const unr=unread(t);
              return(
                <div key={u.id} className={`msg-conv-item${active.id===u.id&&active.type==='dm'?' on':''}`} onClick={()=>selectConv(t)}>
                  <div className="msg-conv-av" style={{background:avColor(u.nom||'?'),fontSize:'13px',fontWeight:700}}>{initials(u.nom||'?')}</div>
                  <div className="msg-conv-info">
                    <div className="msg-conv-name">{u.nom}</div>
                    <div className="msg-conv-prev">{lastMsg(u.id,'dm')||u.role}</div>
                  </div>
                  {unr>0&&<div className="msg-conv-badge">{unr}</div>}
                </div>
              );
            })}
          </>}
        </div>
      </div>

      {/* Main conversation */}
      <div className={`msg-main${mobileView==='list'?' msg-mob-hidden':''}`}>
        {/* Header */}
        <div className="msg-conv-hdr">
          <button className="msg-back-btn" onClick={()=>setMobileView('list')}>←</button>
          <div className="msg-conv-av-sm" style={{background:active.type==='channel'?'var(--glass-emerald)':avColor(active.name||'?'),fontSize:active.type==='channel'?'16px':'12px',fontWeight:700}}>
            {active.type==='channel'?PUB_CHANNELS.find(c=>c.id===active.id)?.icon||'💬':initials(active.name||'?')}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:'15px'}}>{active.name}</div>
            <div style={{fontSize:'12px',color:'var(--muted)'}}>{active.sub}</div>
          </div>
        </div>

        {/* Messages */}
        <div className="msg-msgs">
          {grouped.map((item,i)=>{
            if(item.type==='sep')return(<div key={i} className="chat-date-sep"><span>{item.day}</span></div>);
            const mine=item._from===user?.id;
            const sender=getUser(item._from);
            return(
              <div key={item.id||i} className={`msg-row${mine?' mine':''}`}>
                {!mine&&item._showAv&&<div className="msg-av" style={{background:avColor(sender.nom||'?'),color:'var(--text)'}}>{initials(sender.nom||'?')}</div>}
                {!mine&&!item._showAv&&<div style={{width:28,flexShrink:0}}/>}
                <div className="msg-bubbles">
                  {!mine&&item._showAv&&<div className="msg-sender">{sender.nom}</div>}
                  <div className={`bubble ${mine?'bubble-mine':'bubble-them'}`} onDoubleClick={()=>setMenuFor(menuFor===item.id?null:item.id)}>
                    {(()=>{try{const p=JSON.parse(item.content);if(p._t==='media'){return(<div>{p.mime?.startsWith('video/')?<video src={p.url} controls style={{maxWidth:'100%',maxHeight:220,borderRadius:8,display:'block'}}/>:<img src={p.url} alt="" style={{maxWidth:'100%',maxHeight:220,borderRadius:8,display:'block',cursor:'zoom-in'}} onClick={()=>window.open(p.url,'_blank')}/>}{p.text&&<div style={{marginTop:6,fontSize:13}}>{p.text}</div>}</div>);}}catch{}return item.content;})()}
                    {menuFor===item.id&&(mine||user?.role==='admin')&&(
                      <div style={{marginTop:'6px',display:'flex',gap:'6px'}}>
                        <button onClick={async()=>{await supabase.from('messages').delete().eq('id',item.id);setMenuFor(null);}} style={{fontSize:'11px',background:'rgba(239,68,68,0.2)',border:'1px solid rgba(239,68,68,0.4)',color:'#fca5a5',borderRadius:'var(--r-pill)',padding:'2px 8px',cursor:'pointer'}}>Supprimer</button>
                      </div>
                    )}
                  </div>
                  <div className="msg-time">{fmtT(item._ts)}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div className="msg-input-row" style={{flexDirection:'column',gap:0}}>
          {mediaPreview&&(
            <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:8,padding:'8px',background:'var(--glass-1)',borderRadius:'var(--r-md)',border:'1px solid var(--glass-border)'}}>
              {mediaFile?.type.startsWith('video/')?<video src={mediaPreview} style={{maxHeight:100,maxWidth:140,borderRadius:6}}/>:<img src={mediaPreview} alt="" style={{maxHeight:100,maxWidth:140,borderRadius:6,objectFit:'cover'}}/>}
              <button onClick={()=>{setMediaFile(null);setMediaPreview(null);}} style={{marginLeft:'auto',background:'rgba(239,68,68,0.2)',border:'1px solid rgba(239,68,68,0.4)',color:'#fca5a5',borderRadius:'var(--r-pill)',padding:'2px 8px',fontSize:12,cursor:'pointer',flexShrink:0}}>✕</button>
            </div>
          )}
          <div style={{display:'flex',gap:8,alignItems:'flex-end',width:'100%'}}>
            <label className="msg-media-btn" title="Photo / Vidéo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <input type="file" accept="image/*,video/*" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f){setMediaFile(f);setMediaPreview(URL.createObjectURL(f));}e.target.value='';}}/>
            </label>
            <textarea
              ref={inputRef}
              className="msg-input"
              rows="1"
              value={input}
              onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
              placeholder={`Message ${active.name}...`}
            />
            <button className="chat-send" onClick={send} disabled={sending||(!input.trim()&&!mediaFile)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─ COMMANDES ─ */
function PageCommandes({orders,user,showToast,refresh}){
  const[proofFiles,setProofFiles]=useState({});
  const[uploading,setUploading]=useState({});
  const STATUS_COLOR={confirme:'#60a5fa',preparation:'#fb923c',expedie:'#a78bfa',transit:'#22d3ee',livre:'#4ade80',annule:'#f87171',litige:'#f87171'};
  const P2P_LABEL={waiting_payment:'En attente de paiement',proof_uploaded:'Preuve envoyée — attente vendeur',confirmed:'Paiement confirmé',disputed:'Litige ouvert',resolved:'Litige résolu'};

  const uploadProof=async(orderId)=>{
    const file=proofFiles[orderId];
    if(!file||!user)return;
    setUploading(u=>({...u,[orderId]:true}));
    try{
      const ext=file.name.split('.').pop();
      const path=`${user.id}/proof_${orderId}_${Date.now()}.${ext}`;
      const{error:upErr}=await supabase.storage.from('product-photos').upload(path,file,{contentType:file.type});
      if(upErr)throw upErr;
      const{data}=supabase.storage.from('product-photos').getPublicUrl(path);
      await supabase.rpc('upload_payment_proof',{p_order_id:String(orderId),p_proof_url:data.publicUrl});
      showToast('Preuve envoyée ✓');
      refresh?.();
    }catch(ex){showToast(ex.message,'err');}
    finally{setUploading(u=>({...u,[orderId]:false}));}
  };

  return(<div>
    <div className="page-hero"><div className="wrap"><h1>Mes commandes</h1><p>{orders.length} commande{orders.length!==1?'s':''}</p></div></div>
    <section className="section"><div className="wrap">
      {orders.length===0&&<div className="glass" style={{padding:'48px',textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'12px'}}>📦</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>Aucune commande</div>
        <div style={{color:'var(--muted)'}}>Vos achats apparaîtront ici.</div>
      </div>}
      <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
      {orders.map(o=>{
        const c=STATUS_COLOR[o.status]||'var(--text)';
        const p2pLabel=P2P_LABEL[o.p2p_status]||o.p2p_status||'';
        const canUpload=(!o.p2p_status||o.p2p_status==='waiting_payment');
        return(
          <div key={o.id} className="glass" style={{padding:'20px',borderRadius:'var(--r-lg)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
              <div>
                <div style={{fontWeight:700,fontSize:'16px',marginBottom:'2px'}}>{o.product_nom||o.produit}</div>
                <div style={{fontSize:'12px',color:'var(--muted)',fontFamily:'monospace'}}>#{o.id}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontWeight:800,fontSize:'18px',color:'var(--emerald-glow)'}}>{(o.montant||0).toLocaleString('fr-MG')} Ar</div>
                <span style={{padding:'3px 10px',borderRadius:'999px',fontSize:'11px',fontWeight:600,background:c+'22',color:c,border:`1px solid ${c}44`}}>{o.status}</span>
              </div>
            </div>
            <div style={{display:'flex',gap:'16px',fontSize:'13px',color:'var(--muted)',marginBottom:'12px',flexWrap:'wrap'}}>
              <span>💳 {o.pay_method||'—'}</span>
              <span>📅 {o.date||(o.created_at?new Date(o.created_at).toLocaleDateString('fr-FR'):'')}</span>
            </div>
            {p2pLabel&&(
              <div style={{padding:'10px 14px',background:'var(--glass-emerald)',borderRadius:'var(--r-md)',fontSize:'13px',color:'var(--emerald-glow)',fontWeight:600,marginBottom:'12px'}}>
                🔄 {p2pLabel}
              </div>
            )}
            {o.p2p_status==='disputed'&&o.dispute_reason&&(
              <div style={{padding:'10px 14px',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'var(--r-md)',fontSize:'13px',color:'#fca5a5',marginBottom:'12px'}}>
                ⚠️ Litige : {o.dispute_reason}
              </div>
            )}
            {o.payment_proof_url&&(
              <div style={{marginBottom:'12px'}}>
                <div style={{fontSize:'12px',color:'var(--muted)',marginBottom:'6px'}}>Preuve de paiement :</div>
                <img src={o.payment_proof_url} alt="Preuve" style={{maxWidth:'100%',maxHeight:160,borderRadius:'var(--r-md)',objectFit:'cover',cursor:'pointer'}} onClick={()=>window.open(o.payment_proof_url,'_blank')}/>
              </div>
            )}
            {canUpload&&(
              <div style={{borderTop:'1px solid var(--glass-border)',paddingTop:'12px'}}>
                <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'8px'}}>Uploadez votre preuve de paiement :</div>
                <label style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px',border:'2px dashed var(--glass-border-hi)',borderRadius:'var(--r-md)',cursor:'pointer',background:'var(--glass-1)',fontSize:'13px'}}>
                  <span>📸</span>
                  <span style={{color:'var(--muted)'}}>{proofFiles[o.id]?proofFiles[o.id].name:'Capture d\'écran du virement'}</span>
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)setProofFiles(pf=>({...pf,[o.id]:f}));e.target.value='';}}/>
                </label>
                {proofFiles[o.id]&&(
                  <button onClick={()=>uploadProof(o.id)} disabled={uploading[o.id]} style={{marginTop:'8px',width:'100%',padding:'10px',background:'var(--emerald)',color:'#fff',border:'none',borderRadius:'var(--r-pill)',fontWeight:700,fontSize:'13px',cursor:'pointer',opacity:uploading[o.id]?0.6:1}}>
                    {uploading[o.id]?'Envoi...':'Envoyer la preuve ✓'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div></section>
  </div>);
}

/* ─ VENDOR DASHBOARD — list & manage own products ─ */
function VendeurDashboard({user, showToast, refreshAll, refreshUser}){
  const blank={nom:'',description:'',category_id:'',region:'',prix:'',emoji:'🛍️',image_url:'',badge:'',deliv:'3-5 jours',stock:1};
  const[products,setProducts]=useState([]);
  const[categories,setCategories]=useState([]);
  const[editing,setEditing]=useState(null); // null | 'new' | productId
  const[form,setForm]=useState(blank);
  const[photoFile,setPhotoFile]=useState(null);
  const[busy,setBusy]=useState(false);
  const[preview,setPreview]=useState(null);
  const[confirmAction,setConfirmAction]=useState(null);
  const[showKYC,setShowKYC]=useState(false);
  const[kycInfo,setKycInfo]=useState(null);
  const[vendOrders,setVendOrders]=useState([]);
  const[vendTab,setVendTab]=useState('products');
  const[mapOrder,setMapOrder]=useState(null);
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));

  const kycStatut=user?.kyc_statut||'non_soumis';
  const kycApproved=kycStatut==='approuve';

  useEffect(()=>{
    supabase.from('kyc_demandes').select('statut,motif_rejet,created_at').eq('vendeur_id',user.id)
      .order('created_at',{ascending:false}).limit(1).maybeSingle()
      .then(({data})=>setKycInfo(data||null));
  },[user.id,kycStatut]);

  // Revoke previous object URL when photoFile changes to prevent memory leaks. (BUG 5)
  useEffect(()=>{
    if(!photoFile){setPreview(null);return;}
    const url=URL.createObjectURL(photoFile);
    setPreview(url);
    return()=>URL.revokeObjectURL(url);
  },[photoFile]);

  const load=useCallback(async()=>{
    const[p,c,o]=await Promise.all([
      supabase.from('products').select('*,category:categories(nom,slug,emoji)').eq('vendeur_id',user.id).order('created_at',{ascending:false}),
      supabase.from('categories').select('*').order('display_order'),
      supabase.from('orders').select('*').eq('vendeur_id',user.id).order('created_at',{ascending:false}),
    ]);
    setProducts(p.data||[]);setCategories(c.data||[]);setVendOrders(o.data||[]);
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
    setConfirmAction({message:`Supprimer "${p.nom}" ?`,fn:async()=>{
      const{error}=await supabase.from('products').delete().eq('id',p.id);
      if(error){showToast(error.message,'err');return;}
      showToast('Produit supprimé');
      load();refreshAll?.();
    }});
  };

  if(showKYC) return <KYCFlow user={user} showToast={showToast} onDone={async()=>{await refreshUser?.();setShowKYC(false);}}/>;

  const KYCBanner=()=>{
    if(kycStatut==='approuve') return(
      <div className="kyc-banner kyc-ok">
        <span>✅</span>
        <div><strong>Identité vérifiée</strong><span> — Vous pouvez publier des produits</span></div>
      </div>
    );
    if(kycStatut==='en_attente') return(
      <div className="kyc-banner kyc-wait">
        <span>⏳</span>
        <div><strong>Vérification en cours</strong><span> — Délai 24-48h. Vous pourrez publier dès validation.</span></div>
      </div>
    );
    if(kycStatut==='rejete') return(
      <div className="kyc-banner kyc-err">
        <div style={{flex:1}}>
          <strong>Dossier rejeté</strong>
          {kycInfo?.motif_rejet&&<div style={{fontSize:'13px',marginTop:'4px',opacity:.85}}>{kycInfo.motif_rejet}</div>}
        </div>
        <Btn sm onClick={()=>setShowKYC(true)}>Renvoyer →</Btn>
      </div>
    );
    return(
      <div className="kyc-banner kyc-warn">
        <span>🪪</span>
        <div style={{flex:1}}><strong>Vérification d'identité requise</strong><span style={{display:'block',fontSize:'13px',marginTop:'2px',opacity:.8}}>Soumettez votre CIN pour pouvoir publier des produits.</span></div>
        <Btn sm onClick={()=>setShowKYC(true)}>Vérifier mon identité →</Btn>
      </div>
    );
  };

  return(<div>
    <KYCBanner/>
    {confirmAction&&(
      <div className="modal-bg" onClick={e=>{if(e.target===e.currentTarget)setConfirmAction(null);}}>
        <div className="modal" style={{maxWidth:'400px'}}>
          <div className="modal-title">⚠️ Confirmation</div>
          <p style={{color:'var(--muted)',fontSize:'14px',marginBottom:'20px'}}>{confirmAction.message}</p>
          <div className="modal-foot">
            <Btn v="glass" onClick={()=>setConfirmAction(null)}>Annuler</Btn>
            <Btn v="danger" onClick={async()=>{await confirmAction.fn();setConfirmAction(null);}}>Confirmer</Btn>
          </div>
        </div>
      </div>
    )}
    {/* Onglets dashboard vendeur */}
    <div style={{display:'flex',gap:'8px',marginBottom:'28px',borderBottom:'1px solid var(--glass-border)',paddingBottom:'0'}}>
      {[{id:'products',l:'📦 Mes produits'},{id:'orders',l:'🚚 Commandes reçues',badge:vendOrders.filter(o=>o.status==='confirme').length||null}].map(t=>(
        <button key={t.id} onClick={()=>setVendTab(t.id)} style={{padding:'10px 18px',background:'none',border:'none',borderBottom:`2px solid ${vendTab===t.id?'var(--emerald)':'transparent'}`,color:vendTab===t.id?'var(--emerald-glow)':'var(--muted)',fontWeight:600,fontSize:'14px',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px',transition:'all .2s'}}>
          {t.l}{t.badge?<span style={{background:'#ef4444',color:'#fff',borderRadius:'99px',fontSize:'11px',fontWeight:700,padding:'1px 6px'}}>{t.badge}</span>:null}
        </button>
      ))}
    </div>

    {vendTab==='products'&&<div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'24px',flexWrap:'wrap',gap:'16px'}}>
      <div>
        <h2 className="sec-h" style={{marginBottom:'4px'}}>Ma boutique</h2>
        <div style={{color:'var(--muted)',fontSize:'14px'}}>{products.length} produit{products.length>1?'s':''}</div>
      </div>
      {kycApproved
        ?<Btn onClick={openNew}>+ Nouveau produit</Btn>
        :<Btn v="glass" style={{opacity:.5,cursor:'not-allowed'}} title="Vérification d'identité requise">🔒 Nouveau produit</Btn>
      }
    </div>}

    {vendTab==='products'&&products.length===0&&!editing&&(
      <div className="glass" style={{padding:'48px',textAlign:'center'}}>
        <div style={{fontSize:'48px',marginBottom:'12px'}}>📦</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>Aucun produit pour l'instant</div>
        <div style={{color:'var(--muted)',marginBottom:'20px'}}>Ajoute ton premier produit pour qu'il apparaisse dans le catalogue.</div>
        <Btn onClick={openNew}>+ Ajouter mon premier produit</Btn>
      </div>
    )}

    {vendTab==='products'&&products.length>0&&(
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

    {vendTab==='orders'&&(
      <div>
        <h2 className="sec-h" style={{marginBottom:'16px'}}>Commandes reçues</h2>
        {vendOrders.length===0&&<div className="glass" style={{padding:'48px',textAlign:'center'}}><div style={{fontSize:'48px',marginBottom:'12px'}}>🚚</div><div style={{fontFamily:'var(--font-display)',fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>Aucune commande</div><div style={{color:'var(--muted)'}}>Les commandes de vos produits apparaîtront ici.</div></div>}
        {vendOrders.map(o=>(
          <div key={o.id} className="glass" style={{padding:'16px',borderRadius:'var(--r-lg)',marginBottom:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:'8px',marginBottom:'8px'}}>
              <div>
                <div style={{fontWeight:700,fontSize:'15px'}}>{o.product_nom}</div>
                <div style={{color:'var(--muted)',fontSize:'13px'}}>Réf. {o.id} · {o.created_at?.slice(0,10)} · {o.pay_method}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <span style={{fontWeight:700,color:'var(--cyan-light)'}}>{fmt(Number(o.montant))}</span>
                <span style={{padding:'3px 10px',borderRadius:'999px',fontSize:'12px',fontWeight:600,background:'var(--glass-emerald)',color:'var(--emerald-glow)',border:'1px solid rgba(20,123,99,0.3)'}}>{o.status}</span>
              </div>
            </div>
            {o.delivery_lat?(
              <div style={{marginTop:'8px'}}>
                <div style={{fontSize:'13px',color:'var(--muted)',marginBottom:'6px'}}>📍 <strong style={{color:'var(--emerald-glow)'}}>Adresse de livraison :</strong> {o.delivery_address||`${Number(o.delivery_lat).toFixed(5)}, ${Number(o.delivery_lng).toFixed(5)}`}</div>
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                  <a href={`https://www.google.com/maps?q=${o.delivery_lat},${o.delivery_lng}`} target="_blank" rel="noopener noreferrer" style={{padding:'5px 12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-pill)',fontSize:'12px',color:'var(--text)',textDecoration:'none'}}>🗺️ Voir sur Google Maps</a>
                  <a href={`https://waze.com/ul?ll=${o.delivery_lat},${o.delivery_lng}&navigate=yes`} target="_blank" rel="noopener noreferrer" style={{padding:'5px 12px',background:'var(--glass-1)',border:'1px solid var(--glass-border)',borderRadius:'var(--r-pill)',fontSize:'12px',color:'var(--text)',textDecoration:'none'}}>🧭 Waze</a>
                </div>
              </div>
            ):(
              <div style={{fontSize:'13px',color:'var(--muted)',marginTop:'6px'}}>📍 Localisation non disponible — contactez l'acheteur pour l'adresse.</div>
            )}
            {o.p2p_status==='proof_uploaded'&&(
              <div style={{borderTop:'1px solid var(--glass-border)',marginTop:'12px',paddingTop:'12px'}}>
                <div style={{fontWeight:600,fontSize:'13px',color:'var(--emerald-glow)',marginBottom:'10px'}}>📋 Preuve de paiement reçue</div>
                {o.payment_proof_url&&(
                  <div style={{marginBottom:'10px'}}>
                    <img src={o.payment_proof_url} alt="Preuve" style={{maxWidth:'100%',maxHeight:160,borderRadius:'var(--r-md)',objectFit:'cover',cursor:'pointer',display:'block'}} onClick={()=>window.open(o.payment_proof_url,'_blank')}/>
                  </div>
                )}
                <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                  <button onClick={()=>supabase.rpc('confirm_order_payment',{p_order_id:String(o.id)}).then(()=>{showToast('Paiement confirmé ✓');load();})} style={{flex:1,padding:'9px 14px',background:'var(--emerald)',color:'#fff',border:'none',borderRadius:'var(--r-pill)',fontWeight:700,fontSize:'13px',cursor:'pointer'}}>
                    ✓ Confirmer paiement reçu
                  </button>
                  <button onClick={()=>{const r=window.prompt('Motif du litige :');if(r)supabase.rpc('open_order_dispute',{p_order_id:String(o.id),p_reason:r}).then(()=>{showToast('Litige ouvert');load();});}} style={{flex:1,padding:'9px 14px',background:'rgba(239,68,68,0.15)',color:'#fca5a5',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'var(--r-pill)',fontWeight:700,fontSize:'13px',cursor:'pointer'}}>
                    ⚠️ Ouvrir un litige
                  </button>
                </div>
              </div>
            )}
            {o.p2p_status&&o.p2p_status!=='proof_uploaded'&&(
              <div style={{marginTop:'10px',padding:'8px 12px',background:'var(--glass-emerald)',borderRadius:'var(--r-md)',fontSize:'13px',color:'var(--emerald-glow)',fontWeight:600}}>
                🔄 {{waiting_payment:'En attente de paiement acheteur',confirmed:'Paiement confirmé',disputed:'Litige ouvert',resolved:'Litige résolu'}[o.p2p_status]||o.p2p_status}
              </div>
            )}
          </div>
        ))}
      </div>
    )}

    {vendTab==='products'&&editing&&(
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
                <img src={photoFile?preview:form.image_url} alt="aperçu" style={{width:80,height:80,objectFit:'cover',borderRadius:'var(--r-sm)',flexShrink:0}}/>
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
        <VendeurDashboard user={user} showToast={showToast} refreshAll={refreshProducts} refreshUser={refreshUser}/>
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

const AI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const SERAO_CONTEXT = `Tu es l'assistant virtuel de SERAO, une marketplace premium de produits authentiques de Madagascar.
Réponds toujours en français (ou en malagasy si le client écrit en malagasy). Sois concis, chaleureux et professionnel.

INFORMATIONS CLÉS SUR SERAO :
- SERAO est une marketplace qui met en relation vendeurs et acheteurs de produits malagasy authentiques
- Commission : 3% uniquement sur les ventes réalisées. Inscription gratuite pour les vendeurs.
- Produits disponibles : Vanille, Artisanat, Épices, Cosmétiques, Textiles, Bijoux
- Paiements acceptés : MVola, Orange Money, Airtel Money
- Livraison : 3 à 5 jours en moyenne partout à Madagascar
- Support disponible 7j/7 — WhatsApp : +261 38 171 45 48 — Email : nohannsamby@gmail.com

POUR DEVENIR VENDEUR :
1. Créer un compte sur SERAO
2. Activer le statut vendeur dans "Espace vendeur"
3. Soumettre une vérification d'identité (CIN malagasy obligatoire)
4. Attendre la validation de l'équipe SERAO (24-48h)
5. Commencer à publier ses produits

VÉRIFICATION D'IDENTITÉ (KYC) :
- Obligatoire pour tous les vendeurs
- Documents acceptés : CIN (Carte d'Identité Nationale), Passeport, Permis de conduire
- Délai de validation : 24 à 48 heures
- Les documents sont strictement confidentiels

COMMANDES :
- L'acheteur choisit un produit et paie via Mobile Money
- Le vendeur reçoit la commande et prépare l'envoi
- Suivi en temps réel disponible dans "Mes commandes"
- En cas de problème : contacter le support SERAO

Si tu ne connais pas la réponse, dis honnêtement que tu vas transmettre la question à l'équipe et encourage l'utilisateur à utiliser la page Contact.`;

function SupportBot({onClose, user}){
  const[msgs,setMsgs]=useState([
    {role:'model',text:'Bonjour ! 👋 Je suis l\'assistant SERAO. Comment puis-je vous aider aujourd\'hui ?'}
  ]);
  const[input,setInput]=useState('');
  const[loading,setLoading]=useState(false);
  const bottomRef=useRef();
  const inputRef=useRef();

  useEffect(()=>{
    const y=window.scrollY;
    document.body.style.position='fixed';
    document.body.style.top=`-${y}px`;
    document.body.style.width='100%';
    return()=>{
      document.body.style.position='';
      document.body.style.top='';
      document.body.style.width='';
      window.scrollTo(0,y);
    };
  },[]);

  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth'});},[msgs]);

  const send=async()=>{
    const text=input.trim();
    if(!text||loading) return;
    setInput('');
    const userMsg={role:'user',text};
    setMsgs(m=>[...m,userMsg]);
    setLoading(true);
    try{
      if(!AI_KEY) throw new Error('Clé API non configurée');
      const history=msgs.map(m=>({
        role:m.role==='model'?'assistant':'user',
        content:m.text
      }));
      const body={
        model:'llama-3.3-70b-versatile',
        messages:[
          {role:'system',content:SERAO_CONTEXT},
          ...history,
          {role:'user',content:text}
        ],
        temperature:0.7,
        max_tokens:400,
      };
      const res=await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+AI_KEY},body:JSON.stringify(body)}
      );
      if(!res.ok){
        const errBody=await res.json().catch(()=>({}));
        const msg=errBody?.error?.message||'Erreur '+res.status;
        throw new Error('Erreur IA ('+res.status+'): '+msg);
      }
      const data=await res.json();
      const reply=data?.choices?.[0]?.message?.content||'Désolé, je n\'ai pas pu répondre.';
      setMsgs(m=>[...m,{role:'model',text:reply}]);
    }catch(ex){
      setMsgs(m=>[...m,{role:'model',text:'❌ '+ex.message+'\nVeuillez réessayer ou contacter le support.'}]);
    }finally{setLoading(false);inputRef.current?.focus();}
  };

  return(
    <div className="bot-window">
      <div className="bot-header">
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <div style={{width:36,height:36,borderRadius:'50%',overflow:'hidden',flexShrink:0}}><img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Bot%20serao%20.png" alt="Bot" style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>
          <div>
            <div style={{fontWeight:700,fontSize:'14px'}}>Assistant SERAO</div>
            <div style={{fontSize:'11px',color:'var(--emerald-glow)',display:'flex',alignItems:'center',gap:'4px'}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--emerald-glow)',display:'inline-block'}}/>
              En ligne · IA Gemini
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--muted)',cursor:'pointer',fontSize:'20px',padding:'4px',lineHeight:1}}>✕</button>
      </div>

      <div className="bot-messages">
        {msgs.map((m,i)=>(
          <div key={i} className={'bot-msg '+(m.role==='user'?'bot-msg-user':'bot-msg-bot')}>
            {m.role==='model'&&<div className="bot-avatar"><img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Bot%20serao%20.png" alt="Bot" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/></div>}
            <div className="bot-bubble">{m.text}</div>
          </div>
        ))}
        {loading&&(
          <div className="bot-msg bot-msg-bot">
            <div className="bot-avatar"><img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Bot%20serao%20.png" alt="Bot" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/></div>
            <div className="bot-bubble bot-typing"><span/><span/><span/></div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div className="bot-quick">
        {['Comment commander ?','Devenir vendeur','Vérification KYC','Livraison & délais'].map(q=>(
          <button key={q} className="bot-chip" onClick={()=>{setInput(q);inputRef.current?.focus();}}>{q}</button>
        ))}
      </div>

      <div className="bot-input-row">
        <input ref={inputRef} className="fi" value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}}
          placeholder="Posez votre question…" style={{flex:1,height:'40px'}}/>
        <Btn onClick={send} disabled={!input.trim()||loading} style={{height:'40px',padding:'0 16px',flexShrink:0}}>
          {loading?'…':'→'}
        </Btn>
      </div>
    </div>
  );
}

function Footer({nav}){
  return(<footer className="footer">
    <div className="wrap footer-in">
      <div>
        <div className="footer-logo"><img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Font%20SERAO.png" alt="SERAO" className="brand-logo-img footer-logo-img" /></div>
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
  const[showBot,setShowBot]=useState(false);
  const[unread,setUnread]=useState(0);
  const[adminOpen,setAdminOpen]=useState(false);
  const[userMenu,setUserMenu]=useState(false);
  const[payProduct,setPayProduct]=useState(null);
  const[logoClicks,setLogoClicks]=useState(0);
  const logoTimer=useRef(null);
  const userMenuRef=useRef(null);

  const[products,setProducts]=useState([]);
  const[articles,setArticles]=useState(DEF_ARTICLES);
  const[orders,setOrders]=useState([]);
  const[stats,setStats]=useState(null);
  const[theme,setTheme]=useState(()=>{try{return localStorage.getItem('serao-theme')||'light';}catch{return 'light';}});

  // Apply the theme to <html data-theme> and remember the choice.
  useEffect(()=>{
    document.documentElement.dataset.theme=theme;
    try{localStorage.setItem('serao-theme',theme);}catch{}
  },[theme]);
  const toggleTheme=()=>setTheme(t=>t==='dark'?'light':'dark');

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
      // When no profile row exists yet (race with trigger), fall back to
      // user_metadata so nom/role are always available immediately.
      return data
        ?{...authUser,...data}
        :{...authUser,
           nom:authUser.user_metadata?.nom||null,
           role:authUser.user_metadata?.role||'acheteur'
          };
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
        setUser(u); // App never unmounts — no mounted guard needed here
      }
      // TOKEN_REFRESHED: ignore (fires ~hourly, no profile change).
      // INITIAL_SESSION: handled by the getSession() IIFE above as belt-and-suspenders.
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

  // Load published articles from Supabase; keep DEF_ARTICLES as fallback. (BUG 10)
  useEffect(()=>{
    let mounted=true;
    (async()=>{
      const{data,error}=await supabase.from('articles').select('*').eq('publie',true).order('publie_at',{ascending:false});
      if(!mounted||error||!data?.length)return;
      setArticles(data);
    })();
    return()=>{mounted=false;};
  },[]);

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
  const[ordersVersion,setOrdersVersion]=useState(0);
  const refreshOrders=useCallback(()=>setOrdersVersion(v=>v+1),[]);
  useEffect(()=>{
    if(!user){setOrders([]);return;}
    let mounted=true;
    (async()=>{
      const{data,error}=await supabase
        .from('orders')
        .select('*')
        .order('created_at',{ascending:false});
      if(!mounted||error)return;
      const mapped=(data||[]).map(o=>({
        id:o.id,produit:o.product_nom,product_nom:o.product_nom,client:o.acheteur_id===user.id?(user.nom||'Moi'):'',montant:Number(o.montant),pay_method:o.pay_method,status:o.status,date:o.created_at?.slice(0,10),created_at:o.created_at,p2p_status:o.p2p_status,payment_proof_url:o.payment_proof_url,dispute_reason:o.dispute_reason,
      }));
      setOrders(mapped);
      setCart(mapped.filter(o=>o.status!=='annule').length); // BUG 9: initialize cart from real orders
    })();
    return()=>{mounted=false;};
  },[user,ordersVersion]);

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

  if(authLoading)return<div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:'24px',color:'var(--emerald-glow)'}}>⏳ Chargement…</div>;
  if(adminOpen&&isAdmin){
    return(<>
      <AdminPanel onClose={()=>setAdminOpen(false)} refreshProducts={refreshProducts} showToast={showToast}/>
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
        <div className="nav-logo" onClick={handleLogo}><img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Font%20SERAO.png" alt="SERAO" className="brand-logo-img nav-logo-img" /></div>
        <div className="navlinks">{LINKS.map(l=><div key={l.id} className={'nl'+(page===l.id?' on':'')} onClick={()=>nav(l.id)}>{l.l}</div>)}</div>
        <div className="nav-r">
          <button className="nav-iconbtn" onClick={toggleTheme} title={theme==='dark'?'Passer en clair':'Passer en sombre'} aria-label="Changer de thème">
            {theme==='dark'
              ?<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              :<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
          {user?(<>
            <button className="nav-iconbtn nav-iconbtn-auth" onClick={()=>setShowChat(s=>!s)} title="Messages">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {unread>0&&<span className="notif-dot">{unread>9?'9+':unread}</span>}
            </button>
            <button className="nav-iconbtn nav-iconbtn-auth" onClick={()=>showToast(`🛒 Panier : ${cart} article(s)`)}>
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
                <div className="u-drop-item" onClick={()=>{nav('profil');setUserMenu(false);}}>👤 Mon profil</div>
                <div className="u-drop-item" onClick={()=>{nav('messages');setUserMenu(false);}}>💬 Messages</div>
                <div className="u-drop-item" onClick={()=>{nav('commandes');setUserMenu(false);}}>📦 Mes commandes</div>
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
      {user&&(
        <div className="mob-user-header">
          <div className="u-av" style={{width:44,height:44,fontSize:'16px',flexShrink:0}}>{initials(user.nom||user.email||'?')}</div>
          <div>
            <div style={{fontWeight:700,fontSize:'16px',color:'var(--text)'}}>{user.nom||(user.email||'').split('@')[0]||'…'}</div>
            <div style={{fontSize:'12px',color:'var(--emerald-glow)',textTransform:'capitalize',fontWeight:600}}>{user.role||'membre'}</div>
          </div>
        </div>
      )}
      {LINKS.map(l=><div key={l.id} className={'mob-link'+(page===l.id?' on':'')} onClick={()=>nav(l.id)}>{l.l}</div>)}
      {user?(<>
        <div className="mob-link" onClick={()=>{setShowChat(true);setMenu(false);}}>💬 Messages{unread>0&&` (${unread})`}</div>
        <div className="mob-link" onClick={()=>{nav('commandes');setMenu(false);}}>📦 Mes commandes</div>
        {user.role==='vendeur'&&<div className="mob-link" onClick={()=>{nav('vendeur');setMenu(false);}}>🏪 Ma boutique</div>}
        <div className="mob-link" style={{color:'#fca5a5',borderBottom:'none'}} onClick={()=>{logout();setMenu(false);}}>🚪 Déconnexion</div>
      </>):(
        <div className="mob-link" style={{color:'var(--emerald-glow)',borderBottom:'none'}} onClick={()=>{setShowAuth(true);setMenu(false);}}>🔑 Se connecter</div>
      )}
    </div>

    {page==='accueil'   &&<PageAccueil nav={nav} onBuy={onBuy} products={products} articles={articles} stats={stats}/>}
    {page==='catalogue' &&<PageCatalogue products={products} onBuy={onBuy}/>}
    {page==='blog'      &&<PageBlog articles={articles}/>}
    {page==='livraison' &&<PageLivraison/>}
    {page==='live'      &&<PageLive/>}
    {page==='apropos'   &&<PageAPropos nav={nav}/>}
    {page==='faq'       &&<PageFAQ/>}
    {page==='contact'   &&<PageContact showToast={showToast} user={user}/>}
    {page==='cgu'       &&<PageCGU/>}
    {page==='confidentialite'&&<PageConfidentialite/>}
    {page==='vendeur'   &&<PageVendeur user={user} showToast={showToast} setShowAuth={setShowAuth} refreshUser={refreshUser} refreshProducts={refreshProducts}/>}
    {page==='commandes' &&<PageCommandes orders={orders} user={user} showToast={showToast} refresh={refreshOrders}/>}
    {page==='messages'  &&<PageMessages user={user} showToast={showToast}/>}
    {page==='profil'    &&<PageProfil user={user} showToast={showToast} refreshUser={refreshUser} nav={nav}/>}

    <Footer nav={nav}/>

    {/* BOTTOM NAV MOBILE */}
    <div className="bottom-nav">
      <div className="bnav-items">
        {[{id:'accueil',icon:'🏠',l:'Accueil'},{id:'catalogue',icon:'🛍️',l:'Catalogue'},{id:'messages',icon:'💬',l:'Messages'},{id:'profil',icon:'👤',l:'Profil'},{id:'commandes',icon:'📦',l:'Commandes'}].map(b=>(
          <div key={b.id} className={'bnav-item'+(page===b.id?' on':'')} onClick={()=>{
            if((b.id==='messages'||b.id==='profil'||b.id==='commandes')&&!user){setShowAuth(true);return;}
            nav(b.id);
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
    <button className="bot-fab" onClick={()=>setShowBot(s=>!s)} aria-label="Assistance IA" title="Assistance IA">
      {showBot?'✕':<img src="https://ieydodwzccskavzgyrnz.supabase.co/storage/v1/object/public/product-photos/Videos/Bot%20serao%20.png" alt="Bot" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}}/>}
    </button>
    {user&&showChat&&<ChatWindow user={user} onClose={()=>setShowChat(false)}/>}
    {showBot&&<SupportBot onClose={()=>setShowBot(false)} user={user}/>}

    {toast&&<div className="toast"><span className={toastType==='ok'?'t-ok':'t-err'}>{toastType==='ok'?'✓':'✗'}</span>{toast}</div>}
  </div>);
}

export default App;
