const state={siswa:[],program:[],tagihan:[],pembayaran:[]};
const $=id=>document.getElementById(id);
const rupiah=value=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value)||0);
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const todayISO=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`};
const dateText=value=>value?new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}):"-";
const pageTitles={dashboard:"Dashboard",siswa:"Data siswa",program:"Program kursus",tagihan:"Tagihan",pembayaran:"Pembayaran"};
let toastTimer;

function toast(message){const element=$("toast");element.textContent=message;element.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>element.classList.remove("show"),2800)}
$("todayText").textContent=new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>showPage(button.dataset.page)));
document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>showPage(button.dataset.go)));
function showPage(page){document.querySelectorAll(".page").forEach(section=>section.classList.toggle("active-page",section.id===page));document.querySelectorAll(".nav-item").forEach(button=>button.classList.toggle("active",button.dataset.page===page));$("pageTitle").textContent=pageTitles[page]||pageTitles.dashboard}
function openModal(content){$("modalContent").innerHTML=content;$("modalOverlay").classList.remove("hidden");$("modalOverlay").querySelector("input,select,textarea")?.focus()}
function closeModal(){$("modalOverlay").classList.add("hidden");$("modalContent").innerHTML=""}
$("modalClose").addEventListener("click",closeModal);
$("modalOverlay").addEventListener("click",event=>{if(event.target.id==="modalOverlay")closeModal()});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeModal()});

async function loadAll(){
  const results=await Promise.all([
    supabaseClient.from("siswa").select("*").order("nama_siswa"),
    supabaseClient.from("program_kursus").select("*").order("nama_program"),
    supabaseClient.from("tagihan").select("*").order("tanggal_jatuh_tempo",{ascending:false}),
    supabaseClient.from("pembayaran").select("*").order("tanggal_bayar",{ascending:false}).order("id_pembayaran",{ascending:false})
  ]);
  const failure=results.find(result=>result.error);
  if(failure){console.error(failure.error);toast("Gagal memuat data. Periksa config.js dan jalankan database.sql di Supabase.");return}
  [state.siswa,state.program,state.tagihan,state.pembayaran]=results.map(result=>result.data||[]);
  renderAll();
}
function paidAmount(invoiceId){return state.pembayaran.filter(payment=>payment.id_tagihan===invoiceId).reduce((sum,payment)=>sum+Number(payment.jumlah_bayar),0)}
function balance(invoice){return Math.max(0,Number(invoice.jumlah_tagihan)-paidAmount(invoice.id_tagihan))}
function invoiceStatus(invoice){const paid=paidAmount(invoice.id_tagihan);return paid===0?"Belum dibayar":balance(invoice)===0?"Lunas":"Sebagian"}
function studentName(id){return state.siswa.find(student=>student.id_siswa===id)?.nama_siswa||"Siswa dihapus"}
function programName(id){return state.program.find(program=>program.id_program===id)?.nama_program||"Program dihapus"}
function invoiceNumber(id){return `INV-${String(id).padStart(4,"0")}`}
function statusBadge(status){const className=status==="Lunas"||status==="Aktif"?"paid":status==="Sebagian"?"partial":status==="Nonaktif"?"":"unpaid";const activeClass=status==="Aktif"?" active":"";return `<span class="status-badge ${className}${activeClass}">${status}</span>`}
function emptyRow(columns,message){return `<tr><td colspan="${columns}" class="empty">${message}</td></tr>`}
function renderAll(){renderStats();renderDashboard();renderSiswa();renderProgram();renderTagihan();renderPembayaran()}

function renderStats(){
  const now=new Date();const monthPayments=state.pembayaran.filter(payment=>{const date=new Date(`${payment.tanggal_bayar}T00:00:00`);return date.getMonth()===now.getMonth()&&date.getFullYear()===now.getFullYear()});
  const outstanding=state.tagihan.reduce((sum,invoice)=>sum+balance(invoice),0);
  $("statIncome").textContent=rupiah(monthPayments.reduce((sum,payment)=>sum+Number(payment.jumlah_bayar),0));
  $("incomeCount").textContent=`${monthPayments.length} pembayaran bulan ini`;
  $("statReceivable").textContent=rupiah(outstanding);
  $("receivableCount").textContent=`${state.tagihan.filter(invoice=>balance(invoice)>0).length} tagihan belum lunas`;
  $("statStudents").textContent=state.siswa.filter(student=>student.aktif).length;
  $("statPrograms").textContent=state.program.filter(program=>program.aktif).length;
}
function renderDashboard(){
  const openInvoices=state.tagihan.filter(invoice=>balance(invoice)>0).sort((first,second)=>first.tanggal_jatuh_tempo.localeCompare(second.tanggal_jatuh_tempo)).slice(0,5);
  $("duePreview").innerHTML=openInvoices.map(invoice=>`<tr><td class="item-name">${esc(studentName(invoice.id_siswa))}<small class="cell-sub">${esc(programName(invoice.id_program))}</small></td><td>${dateText(invoice.tanggal_jatuh_tempo)}</td><td class="amount">${rupiah(balance(invoice))}</td><td>${statusBadge(invoiceStatus(invoice))}</td></tr>`).join("")||emptyRow(4,"Tidak ada tagihan yang perlu ditindaklanjuti.");
  $("paymentPreview").innerHTML=state.pembayaran.slice(0,5).map(payment=>`<div class="activity-item"><span class="activity-mark" aria-hidden="true">↗</span><div class="activity-copy"><strong>${esc(studentName(state.tagihan.find(invoice=>invoice.id_tagihan===payment.id_tagihan)?.id_siswa))}</strong><small>${dateText(payment.tanggal_bayar)} · ${esc(payment.metode)}</small></div><b>${rupiah(payment.jumlah_bayar)}</b></div>`).join("")||`<div class="empty-block">Belum ada pembayaran tercatat.</div>`;
}

function renderSiswa(filter=$("searchSiswa").value){
  const query=filter.trim().toLocaleLowerCase("id");
  const rows=state.siswa.filter(student=>`${student.nama_siswa} ${student.no_telepon||""} ${student.email||""}`.toLocaleLowerCase("id").includes(query)).map(student=>`<tr><td class="item-name">${esc(student.nama_siswa)}</td><td>${esc(student.no_telepon||"-")}</td><td>${esc(student.email||"-")}</td><td>${dateText(student.tanggal_daftar)}</td><td>${statusBadge(student.aktif?"Aktif":"Nonaktif")}</td><td><div class="action-group"><button class="icon-btn edit-btn" aria-label="Edit siswa" onclick="editSiswa(${student.id_siswa})">✎</button><button class="icon-btn delete-btn" aria-label="Hapus siswa" onclick="deleteSiswa(${student.id_siswa})">×</button></div></td></tr>`).join("");
  $("siswaTable").innerHTML=rows||emptyRow(6,"Belum ada data siswa.");
}
function renderProgram(){
  $("programTable").innerHTML=state.program.map(program=>`<tr><td class="item-name">${esc(program.nama_program)}</td><td>${esc(program.instrumen)}</td><td>${program.durasi_menit} menit</td><td class="amount">${rupiah(program.biaya_bulanan)}</td><td>${statusBadge(program.aktif?"Aktif":"Nonaktif")}</td><td><div class="action-group"><button class="icon-btn edit-btn" aria-label="Edit program" onclick="editProgram(${program.id_program})">✎</button><button class="icon-btn delete-btn" aria-label="Hapus program" onclick="deleteProgram(${program.id_program})">×</button></div></td></tr>`).join("")||emptyRow(6,"Belum ada program kursus.");
}
function renderTagihan(){
  const query=$("searchTagihan").value.trim().toLocaleLowerCase("id");const filter=$("filterTagihan").value;
  const rows=state.tagihan.filter(invoice=>`${studentName(invoice.id_siswa)} ${programName(invoice.id_program)} ${invoice.keterangan||""}`.toLocaleLowerCase("id").includes(query)&&(filter==="semua"||invoiceStatus(invoice)===filter)).map(invoice=>`<tr><td><span class="id-pill">${invoiceNumber(invoice.id_tagihan)}</span></td><td class="item-name">${esc(studentName(invoice.id_siswa))}<small class="cell-sub">${esc(programName(invoice.id_program))}</small></td><td>${esc(invoice.periode)}</td><td>${dateText(invoice.tanggal_jatuh_tempo)}</td><td>${rupiah(invoice.jumlah_tagihan)}</td><td class="amount">${rupiah(balance(invoice))}</td><td>${statusBadge(invoiceStatus(invoice))}</td><td><div class="action-group"><button class="icon-btn edit-btn" aria-label="Edit tagihan" onclick="editTagihan(${invoice.id_tagihan})">✎</button><button class="icon-btn delete-btn" aria-label="Hapus tagihan" onclick="deleteTagihan(${invoice.id_tagihan})">×</button></div></td></tr>`).join("");
  $("tagihanTable").innerHTML=rows||emptyRow(8,"Belum ada tagihan untuk filter ini.");
}
function renderPembayaran(){
  const query=$("searchPembayaran").value.trim().toLocaleLowerCase("id");
  const rows=state.pembayaran.filter(payment=>{const invoice=state.tagihan.find(item=>item.id_tagihan===payment.id_tagihan);return `${studentName(invoice?.id_siswa)} ${payment.referensi||""} ${invoiceNumber(payment.id_tagihan)}`.toLocaleLowerCase("id").includes(query)}).map(payment=>{const invoice=state.tagihan.find(item=>item.id_tagihan===payment.id_tagihan);return `<tr><td>${dateText(payment.tanggal_bayar)}</td><td class="item-name">${esc(studentName(invoice?.id_siswa))}</td><td><span class="id-pill">${invoiceNumber(payment.id_tagihan)}</span></td><td>${esc(payment.metode)}</td><td>${esc(payment.referensi||"-")}</td><td class="amount">${rupiah(payment.jumlah_bayar)}</td><td><div class="action-group"><button class="icon-btn edit-btn" aria-label="Edit pembayaran" onclick="editPembayaran(${payment.id_pembayaran})">✎</button><button class="icon-btn delete-btn" aria-label="Hapus pembayaran" onclick="deletePembayaran(${payment.id_pembayaran})">×</button></div></td></tr>`}).join("");
  $("pembayaranTable").innerHTML=rows||emptyRow(7,"Belum ada pembayaran untuk pencarian ini.");
}

function bindSearch(id,render){$(id).addEventListener("input",render)}
bindSearch("searchSiswa",()=>renderSiswa());bindSearch("searchTagihan",renderTagihan);bindSearch("searchPembayaran",renderPembayaran);
$("filterTagihan").addEventListener("change",renderTagihan);
async function saveRecord(table,payload,idColumn,id){const query=id?supabaseClient.from(table).update(payload).eq(idColumn,id):supabaseClient.from(table).insert(payload);const {error}=await query;if(error){toast(error.message);return false}closeModal();await loadAll();return true}
function modalForm(title,subtitle,fields,buttonText){return `<h2 id="modalTitle" class="modal-title">${title}</h2><p class="modal-sub">${subtitle}</p><form id="recordForm" class="form-grid">${fields}<button class="modal-submit" type="submit">${buttonText}</button></form>`}
function field(label,id,value="",type="text",required=true,extra=""){return `<div class="form-group"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(value)}" ${required?"required":""} ${extra}></div>`}
function selectField(label,id,options,value){return `<div class="form-group"><label for="${id}">${label}</label><select id="${id}" required>${options.map(option=>`<option value="${option.value}" ${String(option.value)===String(value)?"selected":""}>${esc(option.label)}</option>`).join("")}</select></div>`}
function activeOptions(items,idKey,labelKey,selected){return items.filter(item=>item.aktif||item[idKey]===selected).map(item=>({value:item[idKey],label:item[labelKey]}))}

$("addSiswaBtn").onclick=()=>siswaForm();
function siswaForm(id=null){
  const student=state.siswa.find(item=>item.id_siswa===id);const fields=field("Nama siswa","fNama",student?.nama_siswa||"")+field("No. telepon","fTelepon",student?.no_telepon||"", "tel",false)+field("Email","fEmail",student?.email||"","email",false)+field("Tanggal daftar","fDaftar",student?.tanggal_daftar||todayISO(),"date")+`<div class="form-group"><label for="fAktif">Status siswa</label><select id="fAktif"><option value="true" ${student?.aktif!==false?"selected":""}>Aktif</option><option value="false" ${student?.aktif===false?"selected":""}>Nonaktif</option></select></div>`;
  openModal(modalForm(student?"Edit siswa":"Tambah siswa","Lengkapi informasi siswa kursus.",fields,"Simpan siswa"));
  $("recordForm").onsubmit=async event=>{event.preventDefault();await saveRecord("siswa",{nama_siswa:$("fNama").value.trim(),no_telepon:$("fTelepon").value.trim()||null,email:$("fEmail").value.trim()||null,tanggal_daftar:$("fDaftar").value,aktif:$("fAktif").value==="true"},"id_siswa",id)};
}
window.editSiswa=id=>siswaForm(id);
window.deleteSiswa=async id=>{if(!confirm("Hapus data siswa ini? Siswa yang memiliki tagihan tidak dapat dihapus."))return;const {error}=await supabaseClient.from("siswa").delete().eq("id_siswa",id);if(error)return toast("Siswa tidak dapat dihapus karena masih memiliki tagihan.");toast("Data siswa dihapus.");await loadAll()};

$("addProgramBtn").onclick=()=>programForm();
function programForm(id=null){
  const program=state.program.find(item=>item.id_program===id);const fields=field("Nama program","fNama",program?.nama_program||"")+field("Instrumen","fInstrumen",program?.instrumen||"")+field("Durasi per pertemuan (menit)","fDurasi",program?.durasi_menit||45,"number",true,'min="1" step="1"')+field("Biaya bulanan (Rp)","fBiaya",program?.biaya_bulanan||0,"number",true,'min="1" step="1"')+`<div class="form-group"><label for="fAktif">Status program</label><select id="fAktif"><option value="true" ${program?.aktif!==false?"selected":""}>Aktif</option><option value="false" ${program?.aktif===false?"selected":""}>Nonaktif</option></select></div>`;
  openModal(modalForm(program?"Edit program":"Tambah program","Atur instrumen dan biaya kursus per bulan.",fields,"Simpan program"));
  $("recordForm").onsubmit=async event=>{event.preventDefault();await saveRecord("program_kursus",{nama_program:$("fNama").value.trim(),instrumen:$("fInstrumen").value.trim(),durasi_menit:Number($("fDurasi").value),biaya_bulanan:Number($("fBiaya").value),aktif:$("fAktif").value==="true"},"id_program",id)};
}
window.editProgram=id=>programForm(id);
window.deleteProgram=async id=>{if(!confirm("Hapus program ini? Program yang sudah tercantum pada tagihan tidak dapat dihapus."))return;const {error}=await supabaseClient.from("program_kursus").delete().eq("id_program",id);if(error)return toast("Program tidak dapat dihapus karena masih digunakan.");toast("Program dihapus.");await loadAll()};

$("addTagihanBtn").onclick=()=>tagihanForm();
$("quickInvoice").onclick=()=>{showPage("tagihan");tagihanForm()};
function tagihanForm(id=null){
  if(!state.siswa.length||!state.program.length)return toast("Tambahkan data siswa dan program aktif terlebih dahulu.");
  const invoice=state.tagihan.find(item=>item.id_tagihan===id);const students=activeOptions(state.siswa,"id_siswa","nama_siswa",invoice?.id_siswa);const programs=activeOptions(state.program,"id_program","nama_program",invoice?.id_program);
  const fields=selectField("Siswa","fSiswa",students,invoice?.id_siswa)+selectField("Program kursus","fProgram",programs,invoice?.id_program)+field("Periode tagihan","fPeriode",invoice?.periode||new Date().toLocaleDateString("id-ID",{month:"long",year:"numeric"}))+field("Tanggal diterbitkan","fTerbit",invoice?.tanggal_terbit||todayISO(),"date")+field("Tanggal jatuh tempo","fTempo",invoice?.tanggal_jatuh_tempo||todayISO(),"date")+field("Jumlah tagihan (Rp)","fJumlah",invoice?.jumlah_tagihan||"","number",true,'min="1" step="1"')+field("Keterangan","fKeterangan",invoice?.keterangan||"", "text",false);
  openModal(modalForm(invoice?`Edit ${invoiceNumber(id)}`:"Buat tagihan","Jumlah pembayaran tidak boleh melebihi nilai tagihan.",fields,"Simpan tagihan"));
  $("fProgram").addEventListener("change",()=>{if(!invoice){const selected=state.program.find(item=>item.id_program===Number($("fProgram").value));$("fJumlah").value=selected?.biaya_bulanan||""}});
  if(!invoice){const selected=state.program.find(item=>item.id_program===Number($("fProgram").value));$("fJumlah").value=selected?.biaya_bulanan||""}
  $("recordForm").onsubmit=async event=>{event.preventDefault();const payload={id_siswa:Number($("fSiswa").value),id_program:Number($("fProgram").value),periode:$("fPeriode").value.trim(),tanggal_terbit:$("fTerbit").value,tanggal_jatuh_tempo:$("fTempo").value,jumlah_tagihan:Number($("fJumlah").value),keterangan:$("fKeterangan").value.trim()||null};await saveRecord("tagihan",payload,"id_tagihan",id)};
}
window.editTagihan=id=>tagihanForm(id);
window.deleteTagihan=async id=>{if(paidAmount(id)>0)return toast("Tagihan dengan pembayaran tidak dapat dihapus.");if(!confirm("Hapus tagihan ini?"))return;const {error}=await supabaseClient.from("tagihan").delete().eq("id_tagihan",id);if(error)return toast(error.message);toast("Tagihan dihapus.");await loadAll()};

$("addPembayaranBtn").onclick=()=>pembayaranForm();
$("quickPayment").onclick=()=>{showPage("pembayaran");pembayaranForm()};
function pembayaranForm(id=null){
  const payment=state.pembayaran.find(item=>item.id_pembayaran===id);const outstanding=state.tagihan.filter(invoice=>payment?invoice.id_tagihan===payment.id_tagihan:balance(invoice)>0);
  if(!outstanding.length)return toast("Belum ada tagihan dengan sisa pembayaran.");
  const invoiceOptions=outstanding.map(invoice=>({value:invoice.id_tagihan,label:`${invoiceNumber(invoice.id_tagihan)} · ${studentName(invoice.id_siswa)} · sisa ${rupiah(balance(invoice)+(payment?.id_tagihan===invoice.id_tagihan?Number(payment.jumlah_bayar):0))}`}));
  const fields=selectField("Tagihan","fTagihan",invoiceOptions,payment?.id_tagihan)+field("Tanggal pembayaran","fTanggal",payment?.tanggal_bayar||todayISO(),"date")+field("Jumlah pembayaran (Rp)","fJumlah",payment?.jumlah_bayar||"","number",true,'min="1" step="1"')+selectField("Metode pembayaran","fMetode",["Tunai","Transfer bank","QRIS","Lainnya"].map(value=>({value,label:value})),payment?.metode||"Transfer bank")+field("Nomor referensi (opsional)","fReferensi",payment?.referensi||"", "text",false);
  openModal(modalForm(payment?"Edit pembayaran":"Catat pembayaran","Pembayaran akan mengurangi saldo piutang secara otomatis.",fields,"Simpan pembayaran"));
  $("recordForm").onsubmit=async event=>{event.preventDefault();const invoiceId=Number($("fTagihan").value);const amount=Number($("fJumlah").value);const bill=state.tagihan.find(item=>item.id_tagihan===invoiceId);const available=balance(bill)+(payment?.id_tagihan===invoiceId?Number(payment.jumlah_bayar):0);if(amount>available)return toast(`Maksimal pembayaran untuk tagihan ini ${rupiah(available)}.`);await saveRecord("pembayaran",{id_tagihan:invoiceId,tanggal_bayar:$("fTanggal").value,jumlah_bayar:amount,metode:$("fMetode").value,referensi:$("fReferensi").value.trim()||null},"id_pembayaran",id)};
}
window.editPembayaran=id=>pembayaranForm(id);
window.deletePembayaran=async id=>{if(!confirm("Hapus pembayaran ini? Saldo piutang akan bertambah kembali."))return;const {error}=await supabaseClient.from("pembayaran").delete().eq("id_pembayaran",id);if(error)return toast(error.message);toast("Pembayaran dihapus; saldo piutang diperbarui.");await loadAll()};

loadAll();
