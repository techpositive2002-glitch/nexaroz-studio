const APP = {
  leads: [],

  init() {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('csvFile');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); this.loadFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', e => { if (e.target.files[0]) this.loadFile(e.target.files[0]); });

    document.getElementById('generateBtn').addEventListener('click', () => this.generate());
    document.getElementById('downloadSample').addEventListener('click', e => { e.preventDefault(); this.downloadSample(); });
    document.getElementById('refreshBtn').addEventListener('click', () => this.render());

    this.loadState();
  },

  loadFile(file) {
    if (!file.name.endsWith('.csv')) { alert('Please upload a .csv file'); return; }
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: r => {
        if (!r.data.length) { alert('CSV is empty'); return; }
        this.leads = r.data.map((row, i) => ({
          id: i,
          business: row['Business Name'] || row['Business'] || row['business'] || '',
          phone: (row['Phone'] || row['phone'] || '').toString().replace(/[^0-9]/g, ''),
          person: row['Person'] || row['person'] || row['Name'] || row['name'] || '',
          message: '',
          sent: false
        }));
        this.saveState();
        document.querySelector('.card:first-child').innerHTML = `
          <h3>✅ Loaded ${this.leads.length} leads</h3>
          <p style="margin:0;color:#22C55E;font-weight:600;">${this.leads.length} contacts ready</p>
        `;
      }
    });
  },

  async generate() {
    if (!this.leads.length) { alert('Upload a CSV first'); return; }
    if (this.leads.every(l => l.message)) { this.render(); return; }

    const apiKey = document.getElementById('apiKey').value.trim();
    const template = document.getElementById('pitchTemplate').value.trim();
    const pending = this.leads.filter(l => !l.message);

    document.getElementById('loadingIndicator').classList.remove('hidden');
    document.getElementById('generateBtn').disabled = true;

    if (apiKey) {
      for (const lead of pending) {
        lead.message = await this.callAI(lead, apiKey, template);
        this.saveState();
      }
    } else {
      for (const lead of pending) {
        lead.message = template
          .replace(/{person}/g, lead.person || 'there')
          .replace(/{business}/g, lead.business || 'your business');
        this.saveState();
      }
    }

    document.getElementById('loadingIndicator').classList.add('hidden');
    document.getElementById('generateBtn').disabled = false;
    this.render();
  },

  async callAI(lead, apiKey, template) {
    const prompt = `You write short WhatsApp sales messages for "Nexaroz Studio" (website building for small businesses in India).

Write 1-2 sentences for:
Business: ${lead.business || 'Unknown'}
Person: ${lead.person || 'Unknown'}

Rules:
- Greet ${lead.person || 'them'} by name
- Mention ${lead.business || 'their business'} needs a better online presence
- Offer modern websites from ₹5,000
- End with "studio.nexaroz.com" link
- Keep under 150 characters
- Warm, Hinglish tone OK
- Do NOT use placeholders`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 150 }
        })
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) throw new Error('No response');
      return text;
    } catch {
      return template
        .replace(/{person}/g, lead.person || 'there')
        .replace(/{business}/g, lead.business || 'your business');
    }
  },

  sendWA(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.message) return;
    const num = lead.phone.startsWith('91') ? lead.phone : '91' + lead.phone;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(lead.message)}`, '_blank');
    lead.sent = true;
    this.saveState();
    this.render();
  },

  copyMsg(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead || !lead.message) return;
    navigator.clipboard.writeText(lead.message);
    const btn = document.querySelector(`.btn-copy[data-id="${id}"]`);
    if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => btn.textContent = '📋 Copy', 1500); }
  },

  render() {
    const list = document.getElementById('leadsList');
    const count = document.getElementById('leadCount');
    document.getElementById('resultsSection').classList.remove('hidden');

    count.textContent = this.leads.length;

    if (!this.leads.length) {
      list.innerHTML = '<p style="text-align:center;padding:40px;color:#94A3B8;">No leads loaded</p>';
      return;
    }

    list.innerHTML = this.leads.map(lead => `
      <div class="lead-card ${lead.sent ? 'sent' : ''}">
        <div class="lead-top">
          <div>
            <div class="lead-business">${this.esc(lead.business)}</div>
            <div class="lead-person">👤 ${this.esc(lead.person || 'No name')}</div>
          </div>
          <a href="tel:${lead.phone}" class="lead-phone">📞 ${lead.phone}</a>
        </div>
        ${lead.message ? `
          <div class="lead-message">${this.esc(lead.message)}</div>
          <div class="lead-actions">
            <button class="btn-send ${lead.sent ? 'sent' : ''}" onclick="APP.sendWA(${lead.id})">
              ${lead.sent ? '✅ Sent' : '💬 Send WhatsApp'}
            </button>
            <button class="btn-copy" data-id="${lead.id}" onclick="APP.copyMsg(${lead.id})">📋 Copy</button>
          </div>
        ` : '<p style="color:#94A3B8;font-size:13px;">⏳ Click "Generate" to create message</p>'}
      </div>
    `).join('');
  },

  downloadSample() {
    const csv = `Business Name,Phone,Person
Sharma's Restaurant,9876543210,Rajesh Sharma
Glow Beauty Salon,8765432109,Priya Gupta
Dr. Mehta Clinic,7654321098,Dr. Mehta`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'sample-leads.csv'; a.click();
  },

  saveState() { try { localStorage.setItem('nexaroz_leads', JSON.stringify(this.leads)); } catch {} },
  loadState() {
    try {
      const saved = localStorage.getItem('nexaroz_leads');
      if (saved) { this.leads = JSON.parse(saved); if (this.leads.length) this.render(); }
    } catch {}
  },

  esc(s) { return (s || '').replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;'})[c]); }
};

document.addEventListener('DOMContentLoaded', () => APP.init());
