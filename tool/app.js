const APP = {
  leads: [],
  filteredLeads: [],
  filter: 'all',
  searchQuery: '',

  init() {
    this.bindEvents();
    this.loadState();
  },

  bindEvents() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFile');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); this.handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) this.handleFile(e.target.files[0]); });

    document.getElementById('generateBtn').addEventListener('click', () => this.generateMessages());
    document.getElementById('searchInput').addEventListener('input', (e) => { this.searchQuery = e.target.value.toLowerCase(); this.render(); });
    document.getElementById('exportBtn').addEventListener('click', () => this.exportCSV());

    document.getElementById('downloadSample').addEventListener('click', (e) => { e.preventDefault(); this.downloadSampleCSV(); });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filter = btn.dataset.filter;
        this.render();
      });
    });
  },

  handleFile(file) {
    if (!file.name.endsWith('.csv')) { alert('Please upload a CSV file.'); return; }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) { alert('CSV is empty.'); return; }
        this.leads = results.data.map((row, i) => ({
          id: i,
          business: row['Business Name'] || row['Business'] || row['business'] || row['business_name'] || '',
          phone: (row['Phone'] || row['phone'] || row['Phone Number'] || row['phone_number'] || '').toString().replace(/[^0-9]/g, ''),
          person: row['Person'] || row['person'] || row['Name'] || row['name'] || row['Contact Person'] || row['contact_person'] || '',
          email: row['Email'] || row['email'] || row['Email ID'] || '',
          message: '',
          status: 'pending',
          selected: true
        }));
        this.saveState();
        this.render();
        document.getElementById('csvDropZone').classList.add('hidden');
        document.getElementById('generateBtn').classList.remove('hidden');
        document.querySelector('.sample-csv').classList.add('hidden');
      }
    });
  },

  async generateMessages() {
    const leads = this.leads.filter(l => l.status === 'pending');
    if (leads.length === 0) { alert('No pending leads to process.'); return; }

    const apiKey = document.getElementById('apiKey').value.trim();
    const template = document.getElementById('pitchTemplate').value.trim();

    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('generateBtn').disabled = true;

    if (apiKey) {
      await this.generateWithAI(leads, apiKey, template);
    } else {
      this.generateWithTemplate(leads, template);
    }

    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('generateBtn').disabled = false;
    this.saveState();
    this.render();
  },

  generateWithTemplate(leads, template) {
    for (const lead of leads) {
      lead.message = template
        .replace(/{person}/g, lead.person || 'there')
        .replace(/{business}/g, lead.business || 'your business')
        .replace(/{phone}/g, lead.phone || '');
    }
  },

  async generateWithAI(leads, apiKey, template) {
    const batchSize = 5;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      const promises = batch.map(lead => this.callGemini(lead, apiKey, template));
      const messages = await Promise.all(promises);
      for (let j = 0; j < batch.length; j++) {
        batch[j].message = messages[j];
      }
    }
  },

  async callGemini(lead, apiKey, template) {
    const prompt = `You are a sales assistant for "Nexaroz Studio" — a website building service for small businesses in India.

Generate a short, personalized WhatsApp message (max 200 characters, 2-3 sentences) for this lead:

Business: ${lead.business || 'Unknown'}
Contact Person: ${lead.person || 'Unknown'}
Phone: ${lead.phone || 'Unknown'}

The message should:
- Greet the person by name
- Mention their business name
- Say we noticed they don't have a website (or their online presence could be better)
- Offer to build a modern website starting at ₹5,000
- Ask if they're open to a quick chat
- Be warm, professional, and in English/Hinglish
- Include: "Check our work: studio.nexaroz.com"

Do NOT use placeholders. Write the complete message directly.`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 200 }
        })
      });
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || this.fallbackMessage(lead);
    } catch {
      return this.fallbackMessage(lead);
    }
  },

  fallbackMessage(lead) {
    const name = lead.person || 'there';
    const business = lead.business || 'your business';
    return `Hi ${name}! This is Himanshu from Nexaroz Studio. I noticed ${business} could use a better online presence. We build modern websites starting at ₹5,000. Check our work: studio.nexaroz.com — open for a chat?`;
  },

  whatsappLink(phone, message) {
    const clean = phone.replace(/[^0-9]/g, '');
    const num = clean.startsWith('91') ? clean : '91' + clean;
    return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  },

  emailLink(email, message) {
    return `mailto:${email}?subject=Website%20for%20${encodeURIComponent('your business')}&body=${encodeURIComponent(message)}`;
  },

  render() {
    const tbody = document.getElementById('leadsBody');
    const count = document.getElementById('leadCount');

    this.filteredLeads = this.leads.filter(l => {
      if (this.filter === 'all') return true;
      return l.status === this.filter;
    }).filter(l => {
      if (!this.searchQuery) return true;
      const q = this.searchQuery;
      return (l.business || '').toLowerCase().includes(q) ||
             (l.person || '').toLowerCase().includes(q) ||
             (l.phone || '').includes(q);
    });

    count.textContent = this.filteredLeads.length;

    if (this.filteredLeads.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#94A3B8;">No leads found.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.filteredLeads.map((lead, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="business-cell">${this.esc(lead.business)}</td>
        <td><a href="tel:${lead.phone}" style="color:#4F46E5;text-decoration:none;">${lead.phone}</a></td>
        <td>${this.esc(lead.person)}</td>
        <td class="msg-cell">
          <div class="msg-preview" onclick="this.classList.toggle('expanded')">${this.esc(lead.message) || '<span style="color:#94A3B8;">Generate message first</span>'}</div>
        </td>
        <td>
          <div class="action-cell">
            ${lead.message ? `
              <button class="btn-whatsapp" onclick="APP.sendWA(${lead.id})" title="Open WhatsApp">💬</button>
              <button class="btn-copy" onclick="APP.copyMsg(${lead.id})" title="Copy message">📋</button>
            ` : ''}
            ${lead.email ? `<button class="btn-copy" onclick="APP.sendEmail(${lead.id})" title="Send Email">✉️</button>` : ''}
          </div>
        </td>
        <td>
          <select class="status-badge status-${lead.status}" onchange="APP.updateStatus(${lead.id}, this.value)" style="border:none;cursor:pointer;font-size:12px;font-weight:600;padding:4px 10px;border-radius:100px;">
            <option value="pending" ${lead.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="sent" ${lead.status === 'sent' ? 'selected' : ''}>Sent</option>
            <option value="replied" ${lead.status === 'replied' ? 'selected' : ''}>Replied</option>
            <option value="not-interested" ${lead.status === 'not-interested' ? 'selected' : ''}>Not Interested</option>
          </select>
        </td>
      </tr>
    `).join('');
  },

  sendWA(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.message) return;
    window.open(this.whatsappLink(lead.phone, lead.message), '_blank');
    lead.status = 'sent';
    this.saveState();
    this.render();
  },

  copyMsg(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.message) return;
    navigator.clipboard.writeText(lead.message).then(() => {
      const btn = event.target;
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => btn.textContent = orig, 1500);
    });
  },

  sendEmail(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.email || !lead.message) return;
    window.open(this.emailLink(lead.email, lead.message), '_blank');
    lead.status = 'sent';
    this.saveState();
    this.render();
  },

  updateStatus(id, status) {
    const lead = this.leads.find(l => l.id === id);
    if (lead) { lead.status = status; this.saveState(); this.render(); }
  },

  exportCSV() {
    const csv = Papa.unparse(this.leads.map(l => ({
      'Business Name': l.business,
      'Phone': l.phone,
      'Person': l.person,
      'Email': l.email || '',
      'Message': l.message,
      'Status': l.status
    })));
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'nexaroz-leads-export.csv'; a.click();
    URL.revokeObjectURL(url);
  },

  downloadSampleCSV() {
    const sample = `Business Name,Phone,Person,Email
Sharma's Restaurant,9876543210,Rajesh Sharma,rajesh@example.com
Glow Beauty Salon,8765432109,Priya Gupta,
Dr. Mehta Clinic,7654321098,Dr. Mehta,clinic@example.com
Apex Electronics,6543210987,Suresh Kumar,
GreenLeaf Catering,5432109876,Anita Singh,anita@catering.com`;
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sample-leads.csv'; a.click();
    URL.revokeObjectURL(url);
  },

  saveState() {
    try { localStorage.setItem('nexaroz_leads', JSON.stringify(this.leads)); } catch {}
  },

  loadState() {
    try {
      const saved = localStorage.getItem('nexaroz_leads');
      if (saved) { this.leads = JSON.parse(saved); this.render(); }
    } catch {}
  },

  esc(s) { return (s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
};

document.addEventListener('DOMContentLoaded', () => APP.init());
