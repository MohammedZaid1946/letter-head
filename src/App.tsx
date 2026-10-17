import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AlignLeft, CalendarDays, Check, ChevronDown, Download, FileImage, FileText, ImagePlus, Move, Plus, Save, Signature, Trash2, Upload, X } from 'lucide-react';

type SignatureProfile = { id: string; name: string; designation: string; image: string };
const DEFAULT_TEMPLATE = '/assets/letterhead-template.jpg';
const DEFAULT_SIGNATURE = '/assets/ma-saleem-signature.png';
const today = () => new Date().toISOString().slice(0, 10);
const initialBody = 'On behalf of the President, General Secretary, office bearers, and all members of the Telangana Amateur Body Builders and Fitness Association, Hyderabad, we extend our heartfelt wishes to Mr. George Joseph, Former Mr. India, who is currently recovering in the hospital.\n\nWe pray for his good health, strength, and a speedy recovery. May he regain his health soon and return to his normal life with renewed energy and positivity.\n\nOur thoughts and prayers are with him and his family during this time. We wish him a smooth recovery and many more healthy and happy years ahead.\n\nWishing you a speedy recovery, George Joseph Sir. Get well soon!';
const readFile = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
const imageFrom = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
const normalizeImage = async (file: File, png: boolean) => {
  const source = await readFile(file); const image = await imageFrom(source);
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, 0, 0); return canvas.toDataURL(png ? 'image/png' : 'image/jpeg', 0.94);
};
const formatDate = (date: string) => { if (!date) return ''; const [y,m,d] = date.split('-'); return `${d}/${m}/${y}`; };
// Single source of truth for newline semantics: one \n is one line break, \n\n is one blank line.
const splitLines = (value: string) => value.replace(/\r\n?/g, '\n').split('\n');

export default function App() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [templateName, setTemplateName] = useState('Association letterhead image');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());
  const [heading, setHeading] = useState('Best Wishes for a Speedy Recovery');
  const [body, setBody] = useState(initialBody);
  const [closing, setClosing] = useState('With best wishes, President & General Secretary Telangana Amateur Body Builders and Fitness Association Hyderabad');
  const [profiles, setProfiles] = useState<SignatureProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [signatory, setSignatory] = useState('MA Saleem');
  const [designation, setDesignation] = useState('General Secretary TABBFAH');
  const [sigX, setSigX] = useState(77);
  const [sigY, setSigY] = useState(82);
  const [sigWidth, setSigWidth] = useState(13);
  const [bodyTop, setBodyTop] = useState(21.5);
  const [bodyLeft, setBodyLeft] = useState(33.5);
  const [bodyWidth, setBodyWidth] = useState(63);
  const [fontSize, setFontSize] = useState(10.5);
  const [titleSize, setTitleSize] = useState(13);
  const [showLayout, setShowLayout] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'content'|'signature'|'layout'>('content');
  const pageRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('letterhead-signature-profiles-v1');
      if (saved) {
        const parsed: SignatureProfile[] = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length) {
          const first = parsed[0]; setSelectedProfile(first.id); setSignatureImage(first.image); setSignatory(first.name); setDesignation(first.designation);
        }
      } else {
        // A signature crop was provided in the conversation. Offer it as a starter profile.
        fetch(DEFAULT_SIGNATURE).then(r => r.blob()).then(blob => readFile(new File([blob], 'ma-saleem-signature.png', {type:'image/png'}))).then(image => {
          const starter = { id: 'ma-saleem-starter', name: 'MA Saleem', designation: 'General Secretary TABBFAH', image };
          setProfiles([starter]); setSelectedProfile(starter.id); setSignatureImage(starter.image);
          localStorage.setItem('letterhead-signature-profiles-v1', JSON.stringify([starter]));
        }).catch(() => undefined);
      }
    } catch { setNotice('Browser storage is unavailable. You can still upload and use a signature for this letter.'); }
  }, []);

  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer); }, [notice]);

  const bodyLines = useMemo(() => splitLines(body), [body]);
  const estimatedLines = useMemo(() => {
    const charsPerLine = Math.max(28, Math.floor((bodyWidth / 100 * 595) / (fontSize * 0.52)));
    const bodyLineCount = bodyLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / charsPerLine)), 0);
    return bodyLineCount + (heading ? 2 : 0) + (closing ? 3 : 0);
  }, [bodyLines, bodyWidth, fontSize, heading, closing]);
  const overflowWarning = bodyTop + estimatedLines * (fontSize * 1.35 / 8.42) > 80;

  const onTemplateUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice('For this version, upload the letterhead as a PNG or JPEG image. PDF-template import can be added later.'); event.target.value=''; return; }
    try { setTemplate(await normalizeImage(file, file.type !== 'image/jpeg')); setTemplateName(file.name); setNotice('Letterhead image loaded. It will be scaled to A4 when exporting.'); }
    catch { setNotice('Could not read that image. Try a PNG or JPEG.'); }
    event.target.value = '';
  };
  const onSignatureUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { setNotice('Upload a PNG, JPEG, or WebP signature image.'); event.target.value=''; return; }
    try { const image = await normalizeImage(file, true); setSignatureImage(image); setSelectedProfile(''); setNotice('Signature added to this letter. Save it as a profile if you want to reuse it.'); }
    catch { setNotice('Could not read that signature image.'); }
    event.target.value = '';
  };
  const saveProfile = () => {
    if (!signatureImage) { setNotice('Upload a signature image before saving a profile.'); return; }
    if (!signatory.trim()) { setNotice('Enter the signatory name first.'); return; }
    const profile: SignatureProfile = { id: crypto.randomUUID(), name: signatory.trim(), designation: designation.trim(), image: signatureImage };
    const next = [...profiles, profile]; setProfiles(next); setSelectedProfile(profile.id);
    try { localStorage.setItem('letterhead-signature-profiles-v1', JSON.stringify(next)); setNotice('Signature profile saved in this browser.'); }
    catch { setNotice('Profile is active for this session, but the image is too large for browser storage. Try a smaller PNG.'); }
  };
  const chooseProfile = (id: string) => { const profile = profiles.find(p => p.id === id); if (!profile) return; setSelectedProfile(id); setSignatureImage(profile.image); setSignatory(profile.name); setDesignation(profile.designation); };
  const deleteProfile = (id: string) => {
    const next = profiles.filter(p => p.id !== id); setProfiles(next);
    try { localStorage.setItem('letterhead-signature-profiles-v1', JSON.stringify(next)); } catch { /* no-op */ }
    if (selectedProfile === id) { setSelectedProfile(''); setSignatureImage(''); setSignatory(''); setDesignation(''); }
    setNotice('Signature profile deleted from this browser.');
  };
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); };
  const moveSignature = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !pageRef.current || !sigRef.current) return;
    const page = pageRef.current.getBoundingClientRect(); const sig = sigRef.current.getBoundingClientRect();
    const left = Math.min(100 - sig.width/page.width*100, Math.max(0, (event.clientX - page.left - sig.width/2) / page.width * 100));
    const top = Math.min(100 - sig.height/page.height*100, Math.max(0, (event.clientY - page.top - sig.height/2) / page.height * 100));
    setSigX(left); setSigY(top);
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([595.28, 841.89]);
      const bgData = template.startsWith('data:') ? template.split(',')[1] : await (await fetch(template)).arrayBuffer();
      let bg: Awaited<ReturnType<typeof pdf.embedJpg>> | Awaited<ReturnType<typeof pdf.embedPng>>;
      if (typeof bgData === 'string') {
        const bytes = Uint8Array.from(atob(bgData), c => c.charCodeAt(0));
        bg = template.toLowerCase().includes('png') || template.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      } else {
        const bytes = new Uint8Array(bgData as ArrayBuffer);
        const isPng = template.toLowerCase().endsWith('.png') || template.startsWith('data:image/png');
        bg = isPng ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      }
      const W = page.getWidth(), H = page.getHeight();
      page.drawImage(bg, { x:0, y:0, width:W, height:H });
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const x = bodyLeft/100*W, width = bodyWidth/100*W;
      let yTop = bodyTop/100*H;
      const drawText = (text: string, top: number, size: number, font = regular, align: 'left'|'center'='left') => {
        const textWidth = font.widthOfTextAtSize(text, size);
        const tx = align === 'center' ? x + Math.max(0, (width-textWidth)/2) : x;
        page.drawText(text, { x:tx, y:H-top-size, size, font, color:rgb(0.08,0.08,0.09), maxWidth:width });
      };
      const wrap = (text: string, font: typeof regular, size: number) => {
        const words = text.split(/\s+/); const lines: string[]=[]; let line='';
        for (const word of words) { const next = line ? `${line} ${word}` : word; if (font.widthOfTextAtSize(next,size) > width && line) { lines.push(line); line=word; } else line=next; }
        if (line) lines.push(line); return lines;
      };
      if (reference.trim()) { page.drawText(reference.trim(), {x: 180, y: H-18/100*H-10, size:9, font:regular, color:rgb(.2,.2,.2)}); }
      // Date stays in the upper-right reference row; coordinates are relative to the A4 page.
      const dateText = formatDate(date);
      if (dateText) page.drawText(dateText, { x:W*0.89, y:H-16.7/100*H-9, size:9, font:bold, color:rgb(.12,.12,.12) });
      if (heading.trim()) {
        const lines = wrap(heading.trim(), bold, titleSize);
        for (const line of lines) { drawText(line, yTop, titleSize, bold, 'center'); yTop += titleSize*1.25; }
        yTop += 14;
      }
      for (const line of bodyLines) {
        // A blank source line consumes exactly one line height, nothing more.
        if (!line.trim()) { yTop += fontSize*1.35; continue; }
        for (const wrapped of wrap(line, regular, fontSize)) { drawText(wrapped, yTop, fontSize); yTop += fontSize*1.35; }
      }
      if (closing.trim()) {
        yTop += fontSize*1.35;
        for (const line of wrap(closing.trim(), regular, fontSize)) { drawText(line, yTop, fontSize); yTop += fontSize*1.35; }
      }
      if (signatureImage) {
        const img = await imageFrom(signatureImage);
        const data = signatureImage.split(',')[1]; const bytes = Uint8Array.from(atob(data), c=>c.charCodeAt(0));
        const embedded = signatureImage.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const sigW = sigWidth/100*W; const sigH = sigW*(img.height/img.width);
        const sx = sigX/100*W; const sy = H-(sigY/100*H)-sigH;
        page.drawImage(embedded, {x:sx,y:sy,width:sigW,height:sigH});
        const nameSize=9.5, desSize=7.5;
        const nameW=bold.widthOfTextAtSize(signatory,nameSize); const desW=regular.widthOfTextAtSize(designation,desSize);
        page.drawText(signatory,{x:sx+Math.max(0,(sigW-nameW)/2),y:sy-12,size:nameSize,font:bold,color:rgb(.05,.05,.05)});
        page.drawText(designation,{x:sx+Math.max(0,(sigW-desW)/2),y:sy-22,size:desSize,font:regular,color:rgb(.05,.05,.05)});
      }
      const bytes = await pdf.save(); const blob = new Blob([bytes as BlobPart], {type:'application/pdf'}); const url=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=url; a.download=`letter-${date || 'undated'}.pdf`; a.click(); URL.revokeObjectURL(url); setNotice('PDF exported. Check the result before printing or sending.');
    } catch (error) { console.error(error); setNotice('PDF export failed. Try re-uploading the letterhead as a standard JPEG or PNG.'); }
    finally { setExporting(false); }
  };

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark"><FileText size={20}/></div><div className="brand"><strong>Letterhead Studio</strong><span>Association document generator</span></div><div className="topbar-right"><span className="local-badge"><span/> Saved locally</span><button className="primary-button" onClick={exportPdf} disabled={exporting}><Download size={16}/>{exporting?'Generating…':'Export PDF'}</button></div></header>
    <main className="workspace">
      <section className="editor-panel">
        <div className="panel-heading"><div><p className="eyebrow">DOCUMENT WORKSPACE</p><h1>Create a letter</h1><p className="muted">Content is overlaid on your fixed letterhead template.</p></div><div className="step-number">01 <span>/ 03</span></div></div>
        <div className="template-card"><div className="template-icon"><FileImage size={21}/></div><div className="template-info"><strong>Letterhead template</strong><span title={templateName}>{templateName}</span></div><label className="secondary-button upload-button"><Upload size={15}/> Replace<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onTemplateUpload} hidden/></label></div>
        <div className="tabs"><button className={activeTab==='content'?'active':''} onClick={()=>setActiveTab('content')}><AlignLeft size={15}/> Content</button><button className={activeTab==='signature'?'active':''} onClick={()=>setActiveTab('signature')}><Signature size={15}/> Signature</button><button className={activeTab==='layout'?'active':''} onClick={()=>setActiveTab('layout')}><Move size={15}/> Layout</button></div>
        {activeTab==='content' && <div className="form-section">
          <div className="two-col"><label className="field"><span>Reference number <em>Optional</em></span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. TABBFAH/2026/014"/></label><label className="field"><span><CalendarDays size={14}/> Date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div>
          <label className="field"><span>Subject / heading</span><input value={heading} onChange={e=>setHeading(e.target.value)} placeholder="Enter letter heading"/></label>
          <label className="field"><span>Letter body <em>{body.length} characters</em></span><textarea value={body} onChange={e=>setBody(e.target.value)} rows={9} placeholder="Write the letter body. Separate paragraphs with a blank line."/></label>
          <label className="field"><span>Closing statement</span><textarea value={closing} onChange={e=>setClosing(e.target.value)} rows={3} placeholder="With best wishes..."/></label>
          {overflowWarning && <div className="warning"><span>!</span><div><strong>Possible content overflow</strong><p>The current body length may run close to the footer. Check the preview and adjust font size or content width in Layout.</p></div></div>}
          <div className="inline-hint"><Check size={15}/> Paragraphs wrap automatically. The original template artwork is not edited.</div>
        </div>}
        {activeTab==='signature' && <div className="form-section">
          <label className="field"><span>Reusable signature profile</span><div className="select-wrap"><select value={selectedProfile} onChange={e=>chooseProfile(e.target.value)}><option value="">Use a one-time signature</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name} — {p.designation}</option>)}</select><ChevronDown size={16}/></div></label>
          <div className="signature-upload-area">{signatureImage?<><div className="sig-preview"><img src={signatureImage} alt="Signature preview"/></div><div className="sig-file-meta"><strong>Signature loaded</strong><span>Transparent PNG recommended</span></div><button className="icon-button danger" title="Remove signature" onClick={()=>{setSignatureImage('');setSelectedProfile('')}}><Trash2 size={16}/></button></>:<><div className="upload-symbol"><ImagePlus size={22}/></div><strong>Upload handwritten signature</strong><span>PNG, JPEG or WebP</span></>}<label className="secondary-button choose-file"><Upload size={15}/> {signatureImage?'Change signature':'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onSignatureUpload} hidden/></label></div>
          <div className="two-col"><label className="field"><span>Signatory name</span><input value={signatory} onChange={e=>{setSignatory(e.target.value);setSelectedProfile('')}} placeholder="Full name"/></label><label className="field"><span>Designation</span><input value={designation} onChange={e=>{setDesignation(e.target.value);setSelectedProfile('')}} placeholder="Role / designation"/></label></div>
          <button className="secondary-button full-button" onClick={saveProfile}><Save size={15}/> Save current signature as profile</button>
          {profiles.length>0&&<div className="profile-list"><div className="section-label">SAVED PROFILES <span>{profiles.length}</span></div>{profiles.map(p=><div className="profile-row" key={p.id}><img src={p.image} alt=""/><div><strong>{p.name}</strong><span>{p.designation}</span></div><button className="icon-button danger" title={`Delete ${p.name}`} onClick={()=>deleteProfile(p.id)}><Trash2 size={15}/></button></div>)}</div>}
          <div className="inline-hint"><Check size={15}/> Signature profiles are stored in this browser, not uploaded to a server.</div>
        </div>}
        {activeTab==='layout' && <div className="form-section">
          <div className="layout-intro"><strong>Fine-tune the overlay</strong><p>Adjust these settings until the content fits the blank area on your letterhead. Changes update the preview immediately.</p></div>
          <label className="range-field"><span>Body starts from top <b>{bodyTop.toFixed(1)}%</b></span><input type="range" min="16" max="34" step="0.5" value={bodyTop} onChange={e=>setBodyTop(Number(e.target.value))}/></label>
          <label className="range-field"><span>Left margin <b>{bodyLeft.toFixed(1)}%</b></span><input type="range" min="25" max="40" step="0.5" value={bodyLeft} onChange={e=>setBodyLeft(Number(e.target.value))}/></label>
          <label className="range-field"><span>Body width <b>{bodyWidth}%</b></span><input type="range" min="45" max="68" step="1" value={bodyWidth} onChange={e=>setBodyWidth(Number(e.target.value))}/></label>
          <div className="two-col"><label className="field"><span>Body font (pt)</span><input type="number" min="7" max="14" step="0.5" value={fontSize} onChange={e=>setFontSize(Math.min(14,Math.max(7,Number(e.target.value)||7)))}/></label><label className="field"><span>Heading font (pt)</span><input type="number" min="9" max="20" step="0.5" value={titleSize} onChange={e=>setTitleSize(Math.min(20,Math.max(9,Number(e.target.value)||9)))}/></label></div>
          <div className="section-label">SIGNATURE POSITION</div>
          <label className="range-field"><span>Horizontal position <b>{sigX.toFixed(0)}%</b></span><input type="range" min="48" max="87" value={sigX} onChange={e=>setSigX(Number(e.target.value))}/></label>
          <label className="range-field"><span>Vertical position <b>{sigY.toFixed(0)}%</b></span><input type="range" min="60" max="89" value={sigY} onChange={e=>setSigY(Number(e.target.value))}/></label>
          <label className="range-field"><span>Signature width <b>{sigWidth}%</b></span><input type="range" min="8" max="22" value={sigWidth} onChange={e=>setSigWidth(Number(e.target.value))}/></label>
          <button className="secondary-button full-button" onClick={()=>{setBodyTop(21.5);setBodyLeft(33.5);setBodyWidth(63);setFontSize(10.5);setTitleSize(13);setSigX(77);setSigY(82);setSigWidth(13);}}>Reset layout to defaults</button>
        </div>}
        <div className="editor-footer"><span><span className="privacy-dot"/> Runs in your browser</span><button className="text-button" onClick={()=>setShowLayout(v=>!v)}>{showLayout?'Hide':'Show'} layout notes</button></div>
        {showLayout&&<div className="layout-notes"><strong>Template note</strong><p>The starter letterhead is cropped from the image you supplied to remove the black bars around the page. Since it is a scan, text and logos are raster artwork. For the sharpest print result, replace it with a clean, blank, high-resolution scan or original PDF artwork converted to an image.</p></div>}
      </section>
      <section className="preview-panel"><div className="preview-heading"><div><p className="eyebrow">LIVE PREVIEW</p><h2>Document preview</h2></div><span className="page-size">A4 · Portrait</span></div><div className="preview-stage"><div className="paper" ref={pageRef} style={{backgroundImage:`url(${template})`}}>
        {reference.trim()&&<div className="preview-ref" style={{left:'30%',top:'16.7%'}}>Ref: {reference}</div>}
        <div className="preview-date"><strong>{formatDate(date)}</strong></div>
        <div className="preview-content" style={{left:`${bodyLeft}%`,top:`${bodyTop}%`,width:`${bodyWidth}%`,fontSize:`${fontSize*0.87}px`}}>
          {heading.trim()&&<h3 style={{fontSize:`${titleSize*0.87}px`}}>{heading}</h3>}
          <div className="body-lines">{bodyLines.map((line,i)=><div className="body-line" key={i}>{line}</div>)}</div>
          {closing.trim()&&<div className="closing-preview">{closing}</div>}
        </div>
        {signatureImage&&<div ref={sigRef} className={`signature-overlay ${dragging?'dragging':''}`} style={{left:`${sigX}%`,top:`${sigY}%`,width:`${sigWidth}%`}} onPointerDown={startDrag} onPointerMove={moveSignature} onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)} title="Drag to reposition signature"><img src={signatureImage} alt="Signature"/><strong>{signatory}</strong><span>{designation}</span><div className="drag-chip"><Move size={10}/> Drag</div></div>}
      </div></div><div className="preview-controls"><div className="preview-tip"><Move size={15}/><span>Drag the signature on the page to reposition it.</span></div><button className="primary-button export-wide" onClick={exportPdf} disabled={exporting}><Download size={16}/>{exporting?'Generating PDF…':'Download print-ready PDF'}</button></div><div className="preview-disclaimer"><span className="info-dot">i</span><p>Preview is scaled to fit your screen. Always open the exported PDF once before printing to verify text fit, date placement, and signature alignment.</p></div></section>
    </main>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <footer className="app-footer">Letterhead Studio <span>•</span> Template and signatures remain in your browser unless you export the PDF.</footer>
  </div>;
}
