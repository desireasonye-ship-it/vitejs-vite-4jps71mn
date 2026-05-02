import React, { useState, useEffect, useRef } from 'react';

interface Salary {
  min: number;
  max: number;
  currency: string;
}

interface Job {
  id: string;
  platform: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  salary: Salary;
  posted?: string;
  cv?: string;
  cvLoading?: boolean;
  status?: JobStatus;
}

type JobStatus = 'Notified' | 'Applied' | 'Interview Prep';

interface Notification {
  type: 'job' | 'email' | 'info';
  msg: string;
  ts: string;
}

interface Settings {
  rapidApiKey: string;
  anthropicKey: string;
  emailServiceId: string;
  emailTemplateId: string;
  emailPublicKey: string;
  minSalary: number;
  currency: 'GBP' | 'USD' | 'EUR';
  categories: string[];
  refreshInterval: 'manual' | '6hrs' | '24hrs';
}

interface CandidateProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  coreSkills: string[];
  experience: string[];
  education: string;
  certifications: string[];
  visa: string;
}

declare global {
  interface Window {
    emailjs?: {
      init: (key: string) => void;
      send: (
        serviceId: string,
        templateId: string,
        params: Record<string, string>
      ) => Promise<unknown>;
    };
  }
}

const CANDIDATE_PROFILE: CandidateProfile = {
  name: 'Desire Asonye',
  email: 'desireasonye@gmail.com',
  phone: '07350153174',
  location: 'Milton Keynes, United Kingdom (open to worldwide remote)',
  coreSkills: [
    'B2B Content Marketing',
    'SEO',
    'Digital Strategy',
    'Fintech/SaaS/Legaltech Communications',
    'Audio Engineering',
    'Dolby Atmos',
    'Pro Tools',
    'Python (learning)',
    'Project Management',
  ],
  experience: [
    'Head of Communications (Fintech/Legaltech)',
    'Head of Digital Marketing (SaaS)',
    'Content Manager (Church/Non-profit)',
    'Audio Engineer — Credits: Netflix, FilmOne, IronOak Games',
    'Implementing Partner — Association of African Podcasters & Voice Artists',
  ],
  education: 'BSc Mathematics',
  certifications: [
    'DBS Enhanced Disclosure',
    'First Aid at Work',
    'Dolby Atmos',
    'Pro Tools',
  ],
  visa: 'UK-based, eligible for remote international roles',
};

const PROFILE_TEXT: string = `Name: ${CANDIDATE_PROFILE.name}
Email: ${CANDIDATE_PROFILE.email}
Phone: ${CANDIDATE_PROFILE.phone}
Location: ${CANDIDATE_PROFILE.location}
Core Skills: ${CANDIDATE_PROFILE.coreSkills.join(', ')}
Experience: ${CANDIDATE_PROFILE.experience.join('; ')}
Education: ${CANDIDATE_PROFILE.education}
Certifications: ${CANDIDATE_PROFILE.certifications.join(', ')}
Visa: ${CANDIDATE_PROFILE.visa}`;

const PLATFORM_COLORS: Record<string, string> = {
  Indeed: 'bg-blue-600 text-white',
  RemoteOK: 'bg-green-600 text-white',
  Remotive: 'bg-purple-600 text-white',
  WWR: 'bg-orange-600 text-white',
  Himalayas: 'bg-teal-600 text-white',
  RemoteCo: 'bg-pink-600 text-white',
};

const DEFAULT_CATEGORIES: string[] = [
  'Marketing',
  'Communications',
  'Content',
  'Audio',
  'Media Production',
  'Project Management',
];

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Marketing: ['marketing', 'growth', 'seo', 'digital', 'brand', 'demand'],
  Communications: [
    'communications',
    'comms',
    'pr',
    'public relations',
    'communication',
  ],
  Content: ['content', 'copywriter', 'writer', 'editor', 'content marketing'],
  Audio: [
    'audio',
    'sound',
    'dolby',
    'pro tools',
    'mixing',
    'mastering',
    'engineer',
  ],
  'Media Production': ['media', 'production', 'podcast', 'video', 'producer'],
  'Project Management': [
    'project manager',
    'program manager',
    'pm',
    'scrum',
    'delivery',
  ],
};

const FX_TO_GBP: Record<string, number> = { GBP: 1, USD: 0.78, EUR: 0.85 };

function normalizeSalaryToGBP(
  min: number | undefined,
  max: number | undefined,
  currency: string = 'GBP'
): number {
  const rate: number = FX_TO_GBP[currency] || 1;
  const value: number = max || min || 0;
  return Math.round(value * rate);
}

function parseSalaryString(str: string | undefined | null): Salary {
  if (!str) return { min: 0, max: 0, currency: 'GBP' };
  const s: string = String(str);
  let currency: string = 'GBP';
  if (s.includes('$')) currency = 'USD';
  else if (s.includes('€')) currency = 'EUR';
  else if (s.toLowerCase().includes('usd')) currency = 'USD';
  else if (s.toLowerCase().includes('eur')) currency = 'EUR';

  const nums: string[] = s.replace(/,/g, '').match(/\d+(\.\d+)?(k|K)?/g) || [];
  const parsed: number[] = nums
    .map((n: string): number => {
      const isK: boolean = /k/i.test(n);
      const v: number = parseFloat(n.replace(/k/i, ''));
      return isK ? v * 1000 : v;
    })
    .filter((n: number) => n > 1000);

  return {
    min: parsed[0] || 0,
    max: parsed[1] || parsed[0] || 0,
    currency,
  };
}

function isWithin30Days(dateStr: string | undefined): boolean {
  if (!dateStr) return true;
  const d: Date = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  const diff: number = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diff <= 30;
}

function isRemote(location: string | undefined): boolean {
  if (!location) return false;
  const l: string = String(location).toLowerCase();
  return (
    l.includes('remote') || l.includes('worldwide') || l.includes('anywhere')
  );
}

function matchesCategory(text: string, categories: string[]): boolean {
  if (!categories || categories.length === 0) return true;
  const t: string = (text || '').toLowerCase();
  return categories.some((cat: string) =>
    (CATEGORY_KEYWORDS[cat] || []).some((kw: string) => t.includes(kw))
  );
}

const CORS: string = 'https://corsproxy.io/?';

const DEFAULT_SETTINGS: Settings = {
  rapidApiKey: '',
  anthropicKey: '',
  emailServiceId: '',
  emailTemplateId: '',
  emailPublicKey: '',
  minSalary: 40000,
  currency: 'GBP',
  categories: [...DEFAULT_CATEGORIES],
  refreshInterval: 'manual',
};

export default function AutoApplyAgent(): React.ReactElement {
  const [settings, setSettings] = useState<Settings>((): Settings => {
    const saved: string | null = localStorage.getItem('autoapply_settings');
    return saved ? (JSON.parse(saved) as Settings) : DEFAULT_SETTINGS;
  });

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [lastSearched, setLastSearched] = useState<string | null>(null);
  const [activePlatforms, setActivePlatforms] = useState<
    Record<string, boolean>
  >({
    Indeed: true,
    RemoteOK: true,
    Remotive: true,
    WWR: true,
    Himalayas: true,
    RemoteCo: true,
  });
  const [showDrawer, setShowDrawer] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState<string>(
    'marketing communications'
  );
  const emailJsLoadedRef = useRef<boolean>(false);

  useEffect((): void => {
    if (!emailJsLoadedRef.current) {
      const script: HTMLScriptElement = document.createElement('script');
      script.src =
        'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
      script.async = true;
      script.onload = (): void => {
        emailJsLoadedRef.current = true;
        if (window.emailjs && settings.emailPublicKey) {
          try {
            window.emailjs.init(settings.emailPublicKey);
          } catch (e) {
            /* ignore */
          }
        }
      };
      document.body.appendChild(script);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect((): void => {
    if (window.emailjs && settings.emailPublicKey) {
      try {
        window.emailjs.init(settings.emailPublicKey);
      } catch (e) {
        /* ignore */
      }
    }
  }, [settings.emailPublicKey]);

  useEffect((): void => {
    localStorage.setItem('autoapply_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect((): (() => void) | void => {
    if (settings.refreshInterval === 'manual') return;
    const ms: number =
      settings.refreshInterval === '6hrs' ? 6 * 3600 * 1000 : 24 * 3600 * 1000;
    const id: ReturnType<typeof setInterval> = setInterval((): void => {
      void searchAllPlatforms();
    }, ms);
    return (): void => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.refreshInterval]);

  const showError = (msg: string): void => {
    setErrorToast(msg);
    setTimeout((): void => setErrorToast(null), 5000);
  };

  const addNotification = (note: Omit<Notification, 'ts'>): void => {
    setNotifications((prev: Notification[]): Notification[] =>
      [{ ...note, ts: new Date().toISOString() }, ...prev].slice(0, 100)
    );
  };

  // ============== FETCHERS ==============
  async function fetchIndeed(): Promise<Job[]> {
    if (!settings.rapidApiKey) return [];
    try {
      const url: string = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(
        searchQuery + ' remote'
      )}&page=1&num_pages=1&remote_jobs_only=true`;
      const res: Response = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': settings.rapidApiKey,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      });
      if (!res.ok) throw new Error('JSearch ' + res.status);
      const data: { data?: Array<Record<string, unknown>> } = await res.json();
      return (data.data || []).map(
        (j: Record<string, unknown>): Job => ({
          id: 'indeed_' + (String(j.job_id) || Math.random().toString()),
          platform: 'Indeed',
          title: String(j.job_title || ''),
          company: String(j.employer_name || ''),
          location: String(j.job_country || j.job_city || 'Remote'),
          url: String(j.job_apply_link || j.job_google_link || ''),
          description: String(j.job_description || ''),
          salary:
            j.job_min_salary && j.job_max_salary
              ? {
                  min: Number(j.job_min_salary),
                  max: Number(j.job_max_salary),
                  currency: String(j.job_salary_currency || 'USD'),
                }
              : parseSalaryString(j.job_salary as string | undefined),
          posted: j.job_posted_at_datetime_utc as string | undefined,
        })
      );
    } catch (e: unknown) {
      const err = e as Error;
      showError('Indeed: ' + err.message);
      return [];
    }
  }

  async function fetchRemoteOK(): Promise<Job[]> {
    try {
      const res: Response = await fetch(
        CORS + encodeURIComponent('https://remoteok.com/api')
      );
      if (!res.ok) throw new Error('RemoteOK ' + res.status);
      const data: unknown = await res.json();
      const arr: Array<Record<string, unknown>> = Array.isArray(data)
        ? (data as Array<Record<string, unknown>>).slice(1)
        : [];
      return arr.map(
        (j: Record<string, unknown>): Job => ({
          id: 'remoteok_' + String(j.id),
          platform: 'RemoteOK',
          title: String(j.position || ''),
          company: String(j.company || ''),
          location: String(j.location || 'Remote — Worldwide'),
          url: String(j.url || j.apply_url || ''),
          description: String(j.description || '').replace(/<[^>]+>/g, ''),
          salary: {
            min: Number(j.salary_min) || 0,
            max: Number(j.salary_max) || 0,
            currency: 'USD',
          },
          posted: j.date as string | undefined,
        })
      );
    } catch (e: unknown) {
      const err = e as Error;
      showError('RemoteOK: ' + err.message);
      return [];
    }
  }

  async function fetchRemotive(): Promise<Job[]> {
    try {
      const res: Response = await fetch(
        CORS + encodeURIComponent('https://remotive.com/api/remote-jobs')
      );
      if (!res.ok) throw new Error('Remotive ' + res.status);
      const data: { jobs?: Array<Record<string, unknown>> } = await res.json();
      return (data.jobs || []).map(
        (j: Record<string, unknown>): Job => ({
          id: 'remotive_' + String(j.id),
          platform: 'Remotive',
          title: String(j.title || ''),
          company: String(j.company_name || ''),
          location: String(j.candidate_required_location || 'Remote'),
          url: String(j.url || ''),
          description: String(j.description || '').replace(/<[^>]+>/g, ''),
          salary: parseSalaryString(j.salary as string | undefined),
          posted: j.publication_date as string | undefined,
        })
      );
    } catch (e: unknown) {
      const err = e as Error;
      showError('Remotive: ' + err.message);
      return [];
    }
  }

  async function fetchWWR(): Promise<Job[]> {
    try {
      const res: Response = await fetch(
        CORS + encodeURIComponent('https://weworkremotely.com/remote-jobs.rss')
      );
      if (!res.ok) throw new Error('WWR ' + res.status);
      const text: string = await res.text();
      const xml: Document = new DOMParser().parseFromString(text, 'text/xml');
      const items: Element[] = Array.from(xml.querySelectorAll('item'));
      return items.map((it: Element, idx: number): Job => {
        const title: string = it.querySelector('title')?.textContent || '';
        const link: string = it.querySelector('link')?.textContent || '';
        const desc: string = it.querySelector('description')?.textContent || '';
        const pub: string = it.querySelector('pubDate')?.textContent || '';
        const region: string =
          it.querySelector('region')?.textContent || 'Remote — Worldwide';
        const parts: string[] = title.split(':');
        const company: string = parts.length > 1 ? parts[0].trim() : 'Unknown';
        const jobTitle: string =
          parts.length > 1 ? parts.slice(1).join(':').trim() : title;
        return {
          id: 'wwr_' + idx + '_' + link,
          platform: 'WWR',
          title: jobTitle,
          company,
          location: region,
          url: link,
          description: desc.replace(/<[^>]+>/g, ''),
          salary: parseSalaryString(desc),
          posted: pub,
        };
      });
    } catch (e: unknown) {
      const err = e as Error;
      showError('WWR: ' + err.message);
      return [];
    }
  }

  async function fetchHimalayas(): Promise<Job[]> {
    try {
      const res: Response = await fetch(
        CORS + encodeURIComponent('https://himalayas.app/jobs/api')
      );
      if (!res.ok) throw new Error('Himalayas ' + res.status);
      const data: unknown = await res.json();
      const jobsRaw: Array<Record<string, unknown>> =
        (data as { jobs?: Array<Record<string, unknown>> }).jobs ||
        (Array.isArray(data) ? (data as Array<Record<string, unknown>>) : []);
      return jobsRaw.map(
        (j: Record<string, unknown>): Job => ({
          id: 'himalayas_' + String(j.guid || j.id || Math.random()),
          platform: 'Himalayas',
          title: String(j.title || ''),
          company: String(j.companyName || j.company || ''),
          location:
            (Array.isArray(j.locationRestrictions)
              ? (j.locationRestrictions as string[]).join(', ')
              : '') || 'Remote — Worldwide',
          url: String(j.applicationLink || j.url || j.guid || ''),
          description: String(j.excerpt || j.description || '').replace(
            /<[^>]+>/g,
            ''
          ),
          salary: {
            min: Number(j.minSalary) || 0,
            max: Number(j.maxSalary) || 0,
            currency: String(j.currency || 'USD'),
          },
          posted: (j.pubDate || j.publishedDate) as string | undefined,
        })
      );
    } catch (e: unknown) {
      const err = e as Error;
      showError('Himalayas: ' + err.message);
      return [];
    }
  }

  async function fetchRemoteCo(): Promise<Job[]> {
    try {
      const res: Response = await fetch(
        CORS + encodeURIComponent('https://remote.co/remote-jobs/feed/')
      );
      if (!res.ok) throw new Error('Remote.co ' + res.status);
      const text: string = await res.text();
      const xml: Document = new DOMParser().parseFromString(text, 'text/xml');
      const items: Element[] = Array.from(xml.querySelectorAll('item'));
      return items.map((it: Element, idx: number): Job => {
        const title: string = it.querySelector('title')?.textContent || '';
        const link: string = it.querySelector('link')?.textContent || '';
        const desc: string = it.querySelector('description')?.textContent || '';
        const pub: string = it.querySelector('pubDate')?.textContent || '';
        return {
          id: 'remoteco_' + idx + '_' + link,
          platform: 'RemoteCo',
          title,
          company: 'Remote.co Listing',
          location: 'Remote — Worldwide',
          url: link,
          description: desc.replace(/<[^>]+>/g, ''),
          salary: parseSalaryString(desc),
          posted: pub,
        };
      });
    } catch (e: unknown) {
      const err = e as Error;
      showError('Remote.co: ' + err.message);
      return [];
    }
  }

  // ============== CV GENERATION ==============
  async function generateCV(job: Job): Promise<string> {
    if (!settings.anthropicKey) {
      return `[CV PLACEHOLDER — Add Anthropic API key in Settings]\n\n${PROFILE_TEXT}\n\nApplied for: ${job.title} at ${job.company}`;
    }
    try {
      const res: Response = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': settings.anthropicKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1500,
            messages: [
              {
                role: 'user',
                content: `You are an expert CV writer. Using the candidate profile below, write a tailored, ATS-optimised CV for the following job. Match keywords from the job description. Format: clean plain text with clear sections (Profile, Experience, Skills, Education). Keep to one page equivalent. Do not fabricate experience not in the profile.

CANDIDATE PROFILE:
${PROFILE_TEXT}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION: ${(job.description || '').slice(0, 800)}`,
              },
            ],
          }),
        }
      );
      if (!res.ok) {
        const t: string = await res.text();
        throw new Error('Claude ' + res.status + ': ' + t.slice(0, 100));
      }
      const data: { content?: Array<{ text?: string }> } = await res.json();
      return data.content?.[0]?.text || 'CV generation returned empty.';
    } catch (e: unknown) {
      const err = e as Error;
      showError('CV gen: ' + err.message);
      return `[CV generation failed: ${err.message}]\n\n${PROFILE_TEXT}`;
    }
  }

  async function sendEmail(job: Job, cvText: string): Promise<void> {
    if (
      !window.emailjs ||
      !settings.emailServiceId ||
      !settings.emailTemplateId ||
      !settings.emailPublicKey
    )
      return;
    try {
      const salaryText: string =
        job.salary && (job.salary.min || job.salary.max)
          ? `${job.salary.currency} ${job.salary.min || ''}${
              job.salary.max ? ' - ' + job.salary.max : ''
            }`
          : 'Not listed';
      await window.emailjs.send(
        settings.emailServiceId,
        settings.emailTemplateId,
        {
          to_email: 'desireasonye@gmail.com',
          job_title: job.title,
          company: job.company,
          platform: job.platform,
          salary: salaryText,
          apply_link: job.url,
          cv_text: cvText,
        }
      );
      addNotification({
        type: 'email',
        msg: `Email sent for ${job.title} @ ${job.company}`,
      });
    } catch (e: unknown) {
      const err = e as { text?: string; message?: string };
      showError('Email: ' + (err.text || err.message || 'send failed'));
    }
  }

  // ============== SEARCH ORCHESTRATOR ==============
  async function searchAllPlatforms(): Promise<void> {
    setLoading(true);
    setLastSearched(new Date().toISOString());

    const tasks: Array<Promise<Job[]>> = [];
    if (activePlatforms.Indeed) tasks.push(fetchIndeed());
    if (activePlatforms.RemoteOK) tasks.push(fetchRemoteOK());
    if (activePlatforms.Remotive) tasks.push(fetchRemotive());
    if (activePlatforms.WWR) tasks.push(fetchWWR());
    if (activePlatforms.Himalayas) tasks.push(fetchHimalayas());
    if (activePlatforms.RemoteCo) tasks.push(fetchRemoteCo());

    const results: Array<PromiseSettledResult<Job[]>> =
      await Promise.allSettled(tasks);
    let all: Job[] = [];
    results.forEach((r: PromiseSettledResult<Job[]>): void => {
      if (r.status === 'fulfilled') all = all.concat(r.value);
    });

    // Filter
    const filtered: Job[] = all.filter((job: Job): boolean => {
      if (!isRemote(job.location)) return false;
      if (!isWithin30Days(job.posted)) return false;
      if (
        !matchesCategory(job.title + ' ' + job.description, settings.categories)
      )
        return false;
      const gbp: number = normalizeSalaryToGBP(
        job.salary?.min,
        job.salary?.max,
        job.salary?.currency
      );
      if (gbp > 0 && gbp < settings.minSalary) return false;
      return true;
    });

    // Dedupe
    const seen: Set<string> = new Set<string>();
    const deduped: Job[] = filtered.filter((j: Job): boolean => {
      const k: string = (j.title + j.company).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    setJobs((prev: Job[]): Job[] => {
      const existingIds: Set<string> = new Set<string>(
        prev.map((p: Job) => p.id)
      );
      const newOnes: Job[] = deduped.filter((d: Job) => !existingIds.has(d.id));
      newOnes.forEach((nj: Job): void =>
        addNotification({
          type: 'job',
          msg: `New: ${nj.title} @ ${nj.company} (${nj.platform})`,
        })
      );

      // Async CV gen for new jobs
      newOnes.forEach((nj: Job): void => {
        void (async (): Promise<void> => {
          const cv: string = await generateCV(nj);
          setJobs((curr: Job[]): Job[] =>
            curr.map(
              (c: Job): Job =>
                c.id === nj.id ? { ...c, cv, cvLoading: false } : c
            )
          );
          void sendEmail(nj, cv);
        })();
      });

      const newJobsWithDefaults: Job[] = newOnes.map(
        (n: Job): Job => ({
          ...n,
          status: 'Notified',
          cvLoading: true,
          cv: '',
        })
      );
      return [...newJobsWithDefaults, ...prev];
    });

    setLoading(false);
  }

  const cycleStatus = (id: string): void => {
    setJobs((prev: Job[]): Job[] =>
      prev.map((j: Job): Job => {
        if (j.id !== id) return j;
        const order: JobStatus[] = ['Notified', 'Applied', 'Interview Prep'];
        const currentIdx: number = order.indexOf(j.status || 'Notified');
        const next: JobStatus = order[(currentIdx + 1) % order.length];
        return { ...j, status: next };
      })
    );
  };

  const copyCV = (cv: string | undefined): void => {
    void navigator.clipboard.writeText(cv || '');
    addNotification({ type: 'info', msg: 'CV copied to clipboard' });
  };

  const stats: { found: number; cvs: number; ready: number } = {
    found: jobs.length,
    cvs: jobs.filter((j: Job) => j.cv && !j.cvLoading).length,
    ready: jobs.filter(
      (j: Job) => j.status === 'Applied' || j.status === 'Interview Prep'
    ).length,
  };

  // ============== UI ==============
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Top stats bar */}
      <div className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold">
            A
          </div>
          <div>
            <h1 className="text-lg font-bold">AutoApply Agent</h1>
            <p className="text-xs text-slate-400">{CANDIDATE_PROFILE.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="px-3 py-1 rounded-md bg-slate-800">
            <span className="text-indigo-400 font-bold">{stats.found}</span>{' '}
            Jobs Found
          </div>
          <div className="px-3 py-1 rounded-md bg-slate-800">
            <span className="text-purple-400 font-bold">{stats.cvs}</span> CVs
            Generated
          </div>
          <div className="px-3 py-1 rounded-md bg-slate-800">
            <span className="text-green-400 font-bold">{stats.ready}</span> Apps
            Ready
          </div>
          <div className="px-3 py-1 rounded-md bg-slate-800 text-slate-400">
            Last:{' '}
            {lastSearched
              ? new Date(lastSearched).toLocaleTimeString()
              : 'Never'}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={(): void => setShowDrawer(!showDrawer)}
            className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >
            🔔 {notifications.length}
          </button>
          <button
            onClick={(): void => setShowSettings(true)}
            className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm"
          >
            ⚙️
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-72 w-full bg-slate-900 border-r border-slate-800 p-4 lg:min-h-screen">
          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">
            Search
          </h2>
          <input
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
              setSearchQuery(e.target.value)
            }
            placeholder="keywords..."
            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm mb-3 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={(): void => {
              void searchAllPlatforms();
            }}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 rounded-md py-2 font-medium text-sm mb-4"
          >
            {loading ? 'Searching...' : '🔎 Search All Platforms'}
          </button>

          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">
            Platforms
          </h2>
          <div className="space-y-2 mb-6">
            {Object.keys(activePlatforms).map((p: string) => (
              <label
                key={p}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={activePlatforms[p]}
                  onChange={(): void =>
                    setActivePlatforms((prev: Record<string, boolean>) => ({
                      ...prev,
                      [p]: !prev[p],
                    }))
                  }
                  className="accent-indigo-500"
                />
                <span
                  className={`px-2 py-0.5 rounded text-xs ${
                    PLATFORM_COLORS[p] || 'bg-slate-700'
                  }`}
                >
                  {p}
                </span>
              </label>
            ))}
          </div>

          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">
            Categories
          </h2>
          <div className="space-y-2 mb-6">
            {DEFAULT_CATEGORIES.map((c: string) => (
              <label
                key={c}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={settings.categories.includes(c)}
                  onChange={(): void => {
                    setSettings(
                      (s: Settings): Settings => ({
                        ...s,
                        categories: s.categories.includes(c)
                          ? s.categories.filter((x: string) => x !== c)
                          : [...s.categories, c],
                      })
                    );
                  }}
                  className="accent-indigo-500"
                />
                <span>{c}</span>
              </label>
            ))}
          </div>

          <h2 className="text-sm font-bold text-slate-400 uppercase mb-3">
            Salary Filter
          </h2>
          <div className="text-xs text-slate-400 mb-1">
            Min: {settings.currency} {settings.minSalary}
          </div>
          <input
            type="range"
            min="20000"
            max="200000"
            step="5000"
            value={settings.minSalary}
            onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
              setSettings(
                (s: Settings): Settings => ({
                  ...s,
                  minSalary: parseInt(e.target.value),
                })
              )
            }
            className="w-full accent-indigo-500"
          />
        </aside>

        {/* Main feed */}
        <main className="flex-1 p-4 lg:p-6">
          {jobs.length === 0 && !loading && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">📭</div>
              <h3 className="text-xl font-bold mb-2">No jobs yet</h3>
              <p className="text-slate-400 text-sm mb-4">
                Configure your API keys in Settings, then hit "Search All
                Platforms".
              </p>
              <button
                onClick={(): void => setShowSettings(true)}
                className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-md text-sm"
              >
                Open Settings
              </button>
            </div>
          )}

          {loading && jobs.length === 0 && (
            <div className="grid gap-4">
              {[1, 2, 3].map((i: number) => (
                <div
                  key={i}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse"
                >
                  <div className="h-5 bg-slate-800 rounded w-1/2 mb-3"></div>
                  <div className="h-3 bg-slate-800 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-800 rounded w-1/4"></div>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-4">
            {jobs.map((job: Job) => {
              const gbp: number = normalizeSalaryToGBP(
                job.salary?.min,
                job.salary?.max,
                job.salary?.currency
              );
              const aboveThreshold: boolean = gbp >= settings.minSalary;
              const expanded: boolean = !!expandedJobs[job.id];
              return (
                <div
                  key={job.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold truncate">
                        {job.title}
                      </h3>
                      <p className="text-slate-400 text-sm">{job.company}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          PLATFORM_COLORS[job.platform]
                        }`}
                      >
                        {job.platform}
                      </span>
                      {job.salary?.min || job.salary?.max ? (
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            aboveThreshold
                              ? 'bg-green-600 text-white'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {job.salary.currency} {job.salary.min || '?'}
                          {job.salary.max ? '–' + job.salary.max : ''}
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded text-xs bg-slate-700 text-slate-400">
                          Salary N/A
                        </span>
                      )}
                      <span className="px-2 py-1 rounded text-xs bg-slate-800 text-slate-300">
                        📍 {job.location || 'Remote'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      onClick={(): void => cycleStatus(job.id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        job.status === 'Notified'
                          ? 'bg-yellow-600'
                          : job.status === 'Applied'
                          ? 'bg-blue-600'
                          : 'bg-purple-600'
                      }`}
                    >
                      {job.status}
                    </button>
                    <button
                      onClick={(): void =>
                        setExpandedJobs((p: Record<string, boolean>) => ({
                          ...p,
                          [job.id]: !p[job.id],
                        }))
                      }
                      className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs"
                    >
                      {expanded ? 'Hide CV' : 'View Tailored CV'}
                    </button>
                    <button
                      onClick={(): void => copyCV(job.cv)}
                      disabled={!job.cv}
                      className="px-3 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs disabled:opacity-50"
                    >
                      📋 Copy CV
                    </button>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-xs"
                    >
                      🚀 Apply Now
                    </a>
                  </div>

                  {expanded && (
                    <div className="mt-3 bg-slate-950 border border-slate-800 rounded-lg p-4">
                      {job.cvLoading ? (
                        <div className="space-y-2 animate-pulse">
                          <div className="h-3 bg-slate-800 rounded w-3/4"></div>
                          <div className="h-3 bg-slate-800 rounded w-full"></div>
                          <div className="h-3 bg-slate-800 rounded w-5/6"></div>
                          <div className="h-3 bg-slate-800 rounded w-2/3"></div>
                          <p className="text-xs text-slate-500 mt-3">
                            Generating tailored CV…
                          </p>
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap text-xs text-slate-200 font-mono">
                          {job.cv}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Right drawer */}
        {showDrawer && (
          <aside className="lg:w-80 w-full bg-slate-900 border-l border-slate-800 p-4 lg:min-h-screen">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-bold">Notifications</h2>
              <button
                onClick={(): void => setNotifications([])}
                className="text-xs text-slate-400 hover:text-white"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2 max-h-screen overflow-y-auto">
              {notifications.length === 0 && (
                <p className="text-sm text-slate-500">No notifications yet.</p>
              )}
              {notifications.map((n: Notification, i: number) => (
                <div key={i} className="bg-slate-800 rounded-md p-3 text-xs">
                  <div className="flex justify-between mb-1">
                    <span
                      className={`font-medium ${
                        n.type === 'job'
                          ? 'text-indigo-400'
                          : n.type === 'email'
                          ? 'text-green-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {n.type.toUpperCase()}
                    </span>
                    <span className="text-slate-500">
                      {new Date(n.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-200">{n.msg}</p>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-bold">Settings</h2>
              <button
                onClick={(): void => setShowSettings(false)}
                className="text-slate-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4">
              {(
                [
                  {
                    k: 'rapidApiKey',
                    label: 'RapidAPI Key (JSearch/Indeed)',
                    type: 'password',
                  },
                  {
                    k: 'anthropicKey',
                    label: 'Anthropic Claude API Key',
                    type: 'password',
                  },
                  { k: 'emailServiceId', label: 'EmailJS Service ID' },
                  { k: 'emailTemplateId', label: 'EmailJS Template ID' },
                  { k: 'emailPublicKey', label: 'EmailJS Public Key' },
                ] as Array<{ k: keyof Settings; label: string; type?: string }>
              ).map((f) => (
                <div key={f.k}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {f.label}
                  </label>
                  <input
                    type={f.type || 'text'}
                    value={String(settings[f.k])}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                      setSettings(
                        (s: Settings): Settings => ({
                          ...s,
                          [f.k]: e.target.value,
                        })
                      )
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Min Salary Threshold
                </label>
                <input
                  type="number"
                  value={settings.minSalary}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>): void =>
                    setSettings(
                      (s: Settings): Settings => ({
                        ...s,
                        minSalary: parseInt(e.target.value) || 0,
                      })
                    )
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Preferred Currency
                </label>
                <select
                  value={settings.currency}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>): void =>
                    setSettings(
                      (s: Settings): Settings => ({
                        ...s,
                        currency: e.target.value as 'GBP' | 'USD' | 'EUR',
                      })
                    )
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm"
                >
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2">
                  Categories
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {DEFAULT_CATEGORIES.map((c: string) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.categories.includes(c)}
                        onChange={(): void => {
                          setSettings(
                            (s: Settings): Settings => ({
                              ...s,
                              categories: s.categories.includes(c)
                                ? s.categories.filter((x: string) => x !== c)
                                : [...s.categories, c],
                            })
                          );
                        }}
                        className="accent-indigo-500"
                      />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Refresh Interval
                </label>
                <select
                  value={settings.refreshInterval}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>): void =>
                    setSettings(
                      (s: Settings): Settings => ({
                        ...s,
                        refreshInterval: e.target.value as
                          | 'manual'
                          | '6hrs'
                          | '24hrs',
                      })
                    )
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm"
                >
                  <option value="manual">Manual only</option>
                  <option value="6hrs">Every 6 hours</option>
                  <option value="24hrs">Every 24 hours</option>
                </select>
              </div>

              <button
                onClick={(): void => {
                  setShowSettings(false);
                  addNotification({ type: 'info', msg: 'Settings saved' });
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-md py-2 font-medium text-sm mt-4"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorToast && (
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm">
          <div className="flex justify-between items-start gap-3">
            <p className="text-sm">{errorToast}</p>
            <button
              onClick={(): void => setErrorToast(null)}
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
