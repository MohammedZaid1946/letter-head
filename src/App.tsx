import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AlignLeft, CalendarDays, Check, ChevronDown, Download, FileImage, FileText, ImagePlus, Move, Save, Signature, Sparkles, Trash2, Undo2, Upload, X } from 'lucide-react';
import {
  A4_HEIGHT_PT,
  A4_WIDTH_PT,
  DEFAULT_BOUNDS,
  DEFAULT_LIMITS,
  MIN_BODY_START_PERCENT,
  computeLayout,
  type LayoutConfig,
} from './lib/documentLayout';
import { autoAdjust, formatAdjustment } from './lib/autoAdjust';
import RangeSlider, { type SliderChange } from './components/RangeSlider';

type SignatureProfile = { id: string; name: string; designation: string; image: string };
type Tone = 'ok' | 'info' | 'warn';
type AdjustStatus = { tone: Tone; title: string; details: string[] };
type LayoutState = {
  bodyTop: number; bodyLeft: number; bodyWidth: number;
  fontSize: number; titleSize: number; lineHeight: number; paragraphSpacing: number;
  sigX: number; sigY: number; sigWidth: number;
};
const DEFAULT_LAYOUT_STATE: LayoutState = {
  bodyTop: 21.5, bodyLeft: 33.5, bodyWidth: 63,
  fontSize: 10.5, titleSize: 13, lineHeight: 1.35, paragraphSpacing: 0,
  sigX: 80, sigY: 74, sigWidth: 13,
};

const DEFAULT_TEMPLATE = '/assets/letterhead-template.jpg';
const DEFAULT_SIGNATURE_SRC = '/assets/ma-saleem-signature.png';
const HEADING_GAP_PT = 14;
// Canonical document units are PDF points. The preview renders the page as a
// container and expresses point values in `cqw` (1% of the A4 page width), so
// every element scales by the exact same factor as the exported PDF.
const ptToPreviewSize = (pt: number) => `calc(100cqw * ${pt} / ${A4_WIDTH_PT})`;
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

export default function App() {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [templateName, setTemplateName] = useState('Association letterhead image');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(today());
  const [heading, setHeading] = useState('Best Wishes for a Speedy Recovery');
  const [body, setBody] = useState(initialBody);
  const [profiles, setProfiles] = useState<SignatureProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureAspect, setSignatureAspect] = useState<number | null>(null);
  const [signatory, setSignatory] = useState('MA Saleem');
  const [designation, setDesignation] = useState('General Secretary TABBFAH');
  const [sigX, setSigX] = useState(80);
  const [sigY, setSigY] = useState(74);
  const [sigWidth, setSigWidth] = useState(13);
  const [bodyTop, setBodyTop] = useState(21.5);
  const [bodyLeft, setBodyLeft] = useState(33.5);
  const [bodyWidth, setBodyWidth] = useState(63);
  const [fontSize, setFontSize] = useState(10.5);
  const [titleSize, setTitleSize] = useState(13);
  const [lineHeight, setLineHeight] = useState(1.35);
  const [paragraphSpacing, setParagraphSpacing] = useState(0);
  const [layoutHistory, setLayoutHistory] = useState<LayoutState[]>([]);
  const [adjustStatus, setAdjustStatus] = useState<AdjustStatus | null>(null);
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
        fetch(DEFAULT_SIGNATURE_SRC).then(r => r.blob()).then(blob => readFile(new File([blob], 'ma-saleem-signature.png', {type:'image/png'}))).then(image => {
          const starter = { id: 'ma-saleem-starter', name: 'MA Saleem', designation: 'General Secretary TABBFAH', image };
          setProfiles([starter]); setSelectedProfile(starter.id); setSignatureImage(starter.image);
          localStorage.setItem('letterhead-signature-profiles-v1', JSON.stringify([starter]));
        }).catch(() => undefined);
      }
    } catch { setNotice('Browser storage is unavailable. You can still upload and use a signature for this letter.'); }
  }, []);

  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 4500); return () => window.clearTimeout(timer); }, [notice]);

  // Derive the signature image aspect ratio (height / width) for proportional layout.
  useEffect(() => {
    if (!signatureImage) { setSignatureAspect(null); return; }
    let cancelled = false;
    imageFrom(signatureImage)
      .then((image) => { if (!cancelled) setSignatureAspect(image.naturalHeight / image.naturalWidth); })
      .catch(() => { if (!cancelled) setSignatureAspect(null); });
    return () => { cancelled = true; };
  }, [signatureImage]);

  const layoutConfig = useMemo<LayoutConfig>(() => ({
    content: { heading, body },
    settings: {
      bodyTopPct: bodyTop,
      bodyLeftPct: bodyLeft,
      bodyWidthPct: bodyWidth,
      fontSizePt: fontSize,
      headingSizePt: titleSize,
      lineHeight,
      paragraphSpacingPt: paragraphSpacing,
    },
    signature: { xPct: sigX, yPct: sigY, widthPct: sigWidth, name: signatory, designation, aspect: signatureAspect },
    bounds: DEFAULT_BOUNDS,
    limits: DEFAULT_LIMITS,
  }), [heading, body, bodyTop, bodyLeft, bodyWidth, fontSize, titleSize, lineHeight, paragraphSpacing, sigX, sigY, sigWidth, signatory, designation, signatureAspect]);

  const layout = useMemo(() => computeLayout(layoutConfig), [layoutConfig]);
  const layoutIssues = useMemo(() => {
    const issues: string[] = [];
    if (bodyTop < MIN_BODY_START_PERCENT) issues.push(`Body start (${bodyTop.toFixed(1)}%) is above the ${MIN_BODY_START_PERCENT}% minimum start position and will be clamped.`);
    if (layout.overflowPt > 0) issues.push('The body may run close to, or into, the protected footer.');
    for (const collision of layout.collisions) issues.push(collision.detail);
    return issues;
  }, [layout, bodyTop]);

  const currentLayout = (): LayoutState => ({ bodyTop, bodyLeft, bodyWidth, fontSize, titleSize, lineHeight, paragraphSpacing, sigX, sigY, sigWidth });
  const applyLayoutState = (state: LayoutState) => {
    setBodyTop(state.bodyTop); setBodyLeft(state.bodyLeft); setBodyWidth(state.bodyWidth);
    setFontSize(state.fontSize); setTitleSize(state.titleSize); setLineHeight(state.lineHeight);
    setParagraphSpacing(state.paragraphSpacing); setSigX(state.sigX); setSigY(state.sigY); setSigWidth(state.sigWidth);
  };
  const pushLayoutHistory = (previous: LayoutState) => setLayoutHistory((prev) => [...prev, previous].slice(-50));
  const undoLayoutChange = () => {
    if (layoutHistory.length === 0) return;
    applyLayoutState(layoutHistory[layoutHistory.length - 1]);
    setLayoutHistory((prev) => prev.slice(0, -1));
    setAdjustStatus({ tone: 'info', title: 'Restored previous layout', details: [] });
  };
  const resetLayout = () => {
    pushLayoutHistory(currentLayout());
    applyLayoutState(DEFAULT_LAYOUT_STATE);
    setAdjustStatus(null);
  };

  // A slider commits only when the user drags the thumb (or uses the keyboard);
  // track clicks never fire this. Preview changes stay live, history is pushed
  // once per committed interaction.
  const onSliderChange = <K extends keyof LayoutState,>(key: K, setValue: (n: number) => void) => (change: SliderChange) => {
    if (change.committed && !change.cancelled && change.value !== change.fromValue) {
      pushLayoutHistory({ ...currentLayout(), [key]: change.fromValue } as LayoutState);
      setAdjustStatus(null);
    }
    setValue(change.value);
  };
  const onNumberChange = <K extends keyof LayoutState,>(key: K, setValue: (n: number) => void, lo: number, hi: number) => (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number(event.target.value);
    if (Number.isNaN(parsed)) return;
    const next = Math.min(hi, Math.max(lo, parsed));
    const previous = currentLayout()[key];
    if (next !== previous) {
      pushLayoutHistory({ ...currentLayout(), [key]: previous } as LayoutState);
      setAdjustStatus(null);
    }
    setValue(next);
  };

  const runAutoAdjust = () => {
    const outcome = autoAdjust(layoutConfig);
    if (outcome.status === 'already-fits') {
      setAdjustStatus({ tone: 'info', title: 'Already fits', details: [outcome.message] });
      return;
    }
    if (outcome.status === 'cannot-fit') {
      setAdjustStatus({ tone: 'warn', title: 'Could not fit safely', details: [outcome.message] });
      return;
    }
    pushLayoutHistory(currentLayout());
    const next = outcome.config.settings;
    setFontSize(next.fontSizePt);
    setLineHeight(next.lineHeight);
    setParagraphSpacing(next.paragraphSpacingPt);
    setBodyTop(next.bodyTopPct);
    setAdjustStatus({ tone: 'ok', title: 'Auto-adjusted successfully', details: outcome.adjustments.map(formatAdjustment) });
  };

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
      const page = pdf.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
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

      // Use the exact same layout the preview renders.
      const exportLayout = computeLayout(layoutConfig);
      const x = exportLayout.bodyLeftPt;
      const width = exportLayout.bodyWidthPt;
      const drawText = (text: string, top: number, size: number, font = regular, align: 'left'|'center'='left') => {
        const textWidth = font.widthOfTextAtSize(text, size);
        const tx = align === 'center' ? x + Math.max(0, (width-textWidth)/2) : x;
        page.drawText(text, { x:tx, y:H-top-size, size, font, color:rgb(0.08,0.08,0.09) });
      };

      if (reference.trim()) { page.drawText(reference.trim(), {x: 180, y: H-18/100*H-10, size:9, font:regular, color:rgb(.2,.2,.2)}); }
      // Date stays in the upper-right reference row; coordinates are relative to the A4 page.
      const dateText = formatDate(date);
      if (dateText) page.drawText(dateText, { x:W*0.89, y:H-16.7/100*H-9, size:9, font:bold, color:rgb(.12,.12,.12) });

      exportLayout.heading.lines.forEach((line, index) => {
        drawText(line, exportLayout.heading.topPt + index * exportLayout.heading.lineAdvancePt, exportLayout.headingSizePt, bold, 'center');
      });
      for (const line of exportLayout.body) {
        if (line.blank) continue;
        drawText(line.text, line.topPt, exportLayout.fontSizePt, regular);
      }

      if (exportLayout.signature && signatureImage) {
        const sig = exportLayout.signature;
        const data = signatureImage.split(',')[1]; const bytes = Uint8Array.from(atob(data), c=>c.charCodeAt(0));
        const embedded = signatureImage.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        page.drawImage(embedded, { x:sig.xPt, y:H-sig.topPt-sig.heightPt, width:sig.widthPt, height:sig.heightPt });
        const nameWidth = bold.widthOfTextAtSize(sig.name.text, sig.name.sizePt);
        const desWidth = regular.widthOfTextAtSize(sig.designation.text, sig.designation.sizePt);
        page.drawText(sig.name.text, { x:sig.xPt+Math.max(0,(sig.widthPt-nameWidth)/2), y:H-sig.name.bottomPt, size:sig.name.sizePt, font:bold, color:rgb(.05,.05,.05) });
        page.drawText(sig.designation.text, { x:sig.xPt+Math.max(0,(sig.widthPt-desWidth)/2), y:H-sig.designation.bottomPt, size:sig.designation.sizePt, font:regular, color:rgb(.05,.05,.05) });
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
          <label className="field"><span>Letter body <em>{body.length} characters</em></span><textarea value={body} onChange={e=>setBody(e.target.value)} rows={10} placeholder="Write the letter body. Separate paragraphs with a blank line."/></label>
          {layoutIssues.length>0 && <div className="warning"><span>!</span><div><strong>Possible content overflow</strong><p>{layoutIssues.join(' ')} Use Auto Adjust or review the Layout settings.</p></div></div>}
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
          <div className="layout-intro"><strong>Fine-tune the overlay</strong><p>Adjust these settings until the content fits the blank area on your letterhead, or let Auto Adjust do it for you.</p></div>
          <button className="primary-button full-button auto-adjust-button" onClick={runAutoAdjust}><Sparkles size={15}/> Auto Adjust to fit content</button>
          <div className="range-field"><span id="range-body-top">Body starts from top <b>{bodyTop.toFixed(1)}%</b> <em>min {MIN_BODY_START_PERCENT}%</em></span><RangeSlider labelId="range-body-top" value={Math.max(bodyTop, MIN_BODY_START_PERCENT)} min={MIN_BODY_START_PERCENT} max={34} step={0.5} onChange={onSliderChange('bodyTop', setBodyTop)} formatValue={v=>`${v} percent from top`}/></div>
          <div className="range-field"><span id="range-body-left">Left margin <b>{bodyLeft.toFixed(1)}%</b></span><RangeSlider labelId="range-body-left" value={bodyLeft} min={25} max={40} step={0.5} onChange={onSliderChange('bodyLeft', setBodyLeft)} formatValue={v=>`${v} percent`}/></div>
          <div className="range-field"><span id="range-body-width">Body width <b>{bodyWidth}%</b></span><RangeSlider labelId="range-body-width" value={bodyWidth} min={45} max={68} step={1} onChange={onSliderChange('bodyWidth', setBodyWidth)} formatValue={v=>`${v} percent`}/></div>
          <div className="range-field"><span id="range-line-height">Line spacing <b>{lineHeight.toFixed(2)}×</b></span><RangeSlider labelId="range-line-height" value={lineHeight} min={1.1} max={1.6} step={0.05} onChange={onSliderChange('lineHeight', setLineHeight)} formatValue={v=>`${v} times`}/></div>
          <div className="range-field"><span id="range-paragraph-spacing">Paragraph spacing <b>{paragraphSpacing.toFixed(1)} pt</b></span><RangeSlider labelId="range-paragraph-spacing" value={paragraphSpacing} min={0} max={12} step={0.5} onChange={onSliderChange('paragraphSpacing', setParagraphSpacing)} formatValue={v=>`${v} points`}/></div>
          <div className="two-col"><label className="field"><span>Body font (pt)</span><input type="number" min="7" max="14" step="0.5" value={fontSize} onChange={onNumberChange('fontSize', setFontSize, 7, 14)}/></label><label className="field"><span>Heading font (pt)</span><input type="number" min="9" max="20" step="0.5" value={titleSize} onChange={onNumberChange('titleSize', setTitleSize, 9, 20)}/></label></div>
          <div className="section-label">SIGNATURE POSITION</div>
          <div className="range-field"><span id="range-sig-x">Horizontal position <b>{sigX.toFixed(0)}%</b></span><RangeSlider labelId="range-sig-x" value={sigX} min={48} max={87} step={1} onChange={onSliderChange('sigX', setSigX)} formatValue={v=>`${v} percent`}/></div>
          <div className="range-field"><span id="range-sig-y">Vertical position <b>{sigY.toFixed(0)}%</b></span><RangeSlider labelId="range-sig-y" value={sigY} min={60} max={89} step={1} onChange={onSliderChange('sigY', setSigY)} formatValue={v=>`${v} percent`}/></div>
          <div className="range-field"><span id="range-sig-width">Signature width <b>{sigWidth}%</b></span><RangeSlider labelId="range-sig-width" value={sigWidth} min={8} max={22} step={1} onChange={onSliderChange('sigWidth', setSigWidth)} formatValue={v=>`${v} percent`}/></div>
          <button className="secondary-button full-button" onClick={resetLayout}>Reset layout to defaults</button>
        </div>}
        <div className="editor-footer"><span><span className="privacy-dot"/> Runs in your browser</span><button className="text-button" onClick={()=>setShowLayout(v=>!v)}>{showLayout?'Hide':'Show'} layout notes</button></div>
        {showLayout&&<div className="layout-notes"><strong>Template note</strong><p>The starter letterhead is cropped from the image you supplied to remove the black bars around the page. Since it is a scan, text and logos are raster artwork. For the sharpest print result, replace it with a clean, blank, high-resolution scan or original PDF artwork converted to an image.</p></div>}
      </section>
      <section className="preview-panel"><div className="preview-heading"><div><p className="eyebrow">LIVE PREVIEW</p><h2>Document preview</h2></div><span className="page-size">A4 · Portrait</span></div><div className="preview-stage"><div className="paper" ref={pageRef} style={{backgroundImage:`url(${template})`}}>
        {reference.trim()&&<div className="preview-ref" style={{left:'30%',top:'16.7%'}}>Ref: {reference}</div>}
        <div className="preview-date"><strong>{formatDate(date)}</strong></div>
        <div className="preview-content" style={{left:`${bodyLeft}%`,top:`${layout.bodyTopPct}%`,width:`${bodyWidth}%`,fontSize:ptToPreviewSize(fontSize),lineHeight}}>
          {layout.heading.lines.length>0&&<div className="preview-heading-lines" style={{fontSize:ptToPreviewSize(titleSize),lineHeight:1.25,marginBottom:ptToPreviewSize(HEADING_GAP_PT)}}>{layout.heading.lines.map((line,i)=><div className="preview-heading-line" key={i}>{line}</div>)}</div>}
          <div className="body-lines">{layout.body.map((line,i)=><div className="body-line" key={i} style={line.spacingBeforePt>0?{marginTop:ptToPreviewSize(line.spacingBeforePt)}:undefined}>{line.text===''?'\u00A0':line.text}</div>)}</div>
        </div>
        {signatureImage&&<div ref={sigRef} className={`signature-overlay ${dragging?'dragging':''}`} style={{left:`${sigX}%`,top:`${sigY}%`,width:`${sigWidth}%`}} onPointerDown={startDrag} onPointerMove={moveSignature} onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)} title="Drag to reposition signature"><img src={signatureImage} alt="Signature"/><strong>{signatory}</strong><span>{designation}</span><div className="drag-chip"><Move size={10}/> Drag</div></div>}
      </div></div>
      <div className="preview-controls"><div className="preview-actions"><button className="secondary-button auto-adjust-button" onClick={runAutoAdjust}><Sparkles size={15}/> Auto Adjust</button>{layoutHistory.length>0&&<button className="text-button undo-button" onClick={undoLayoutChange}><Undo2 size={14}/> Undo</button>}</div><button className="primary-button export-wide" onClick={exportPdf} disabled={exporting}><Download size={16}/>{exporting?'Generating PDF…':'Download print-ready PDF'}</button></div>
      {adjustStatus&&<div className={`adjust-status ${adjustStatus.tone}`}><strong>{adjustStatus.title}</strong>{adjustStatus.details.length>0&&<ul>{adjustStatus.details.map((d,i)=><li key={i}>{d}</li>)}</ul>}</div>}
      <div className="preview-disclaimer"><span className="info-dot">i</span><p>Preview is scaled to fit your screen. Always open the exported PDF once before printing to verify text fit, date placement, and signature alignment.</p></div></section>
    </main>
    {notice&&<div className="toast" role="status"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={15}/></button></div>}
    <footer className="app-footer">Letterhead Studio <span>•</span> Template and signatures remain in your browser unless you export the PDF.</footer>
  </div>;
}
