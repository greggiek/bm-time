'use client';

import { useEffect, useMemo, useState } from 'react';

type PublicModule = {
  code: string; school: string; title: string; summary: string;
  sections: [string, string][];
  quiz: Array<{ question: string; answers: string[] }>;
  practical?: string[]; source?: string;
};
type Completion = { module_code: string; latest_score: number; completed_at: string };
type AcademyUser = { name: string; jobTitle: string; location: string };

export default function AcademyPage() {
  const [pin, setPin] = useState('');
  const [user, setUser] = useState<AcademyUser | null>(null);
  const [modules, setModules] = useState<PublicModule[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [selected, setSelected] = useState<PublicModule | null>(null);
  const [answers, setAnswers] = useState<number[]>([-1, -1, -1, -1, -1]);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  async function load() {
    const response = await fetch('/api/academy/session');
    if (response.status === 401) { setUser(null); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Unable to load Academy.');
    setUser(data.user); setModules(data.modules || []); setCompletions(data.completions || []);
  }
  async function signIn() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/academy/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to sign in.');
      setPin(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to sign in.'); }
    finally { setLoading(false); }
  }
  async function signOut() { await fetch('/api/academy/session', { method: 'DELETE' }); setUser(null); setModules([]); setCompletions([]); }
  function openModule(module: PublicModule) { setSelected(module); setAnswers([-1, -1, -1, -1, -1]); setResult(''); }
  function advanceLesson(nextModule: PublicModule | null) {
    if (!nextModule) { setSelected(null); return; }
    openModule(nextModule);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.academyModal')?.scrollTo({ top: 0, behavior: 'smooth' }));
  }
  async function grade() {
    if (!selected || answers.some(answer => answer < 0)) { setResult('Answer all five questions before grading.'); return; }
    const response = await fetch('/api/academy/attempt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ moduleCode: selected.code, answers }) });
    const data = await response.json(); setResult(data.message || 'Unable to grade quiz.');
    if (response.ok && data.passed) await load();
  }
  const completed = useMemo(() => new Set(completions.map(item => item.module_code)), [completions]);
  const grouped = useMemo(() => modules.reduce<Record<string, PublicModule[]>>((groups, module) => { (groups[module.school] ||= []).push(module); return groups; }, {}), [modules]);
  const selectedIndex = selected ? modules.findIndex(module => module.code === selected.code) : -1;
  const nextModule = selectedIndex >= 0 ? modules[selectedIndex + 1] || null : null;

  if (loading) return <main className="academyShell"><section className="academyLogin">Loading BM Academy…</section></main>;
  if (!user) return <main className="academyShell"><section className="academyLogin"><div className="brand">BM ACADEMY</div><span className="osEyebrow">Part of BM OS</span><h1>Employee Training</h1><p>Use the same four-digit PIN you use for BM Time.</p><input aria-label="Employee PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={event => event.key === 'Enter' && pin.length === 4 && signIn()} placeholder="4-digit PIN"/><button className="primary" disabled={pin.length !== 4 || loading} onClick={signIn}>Open My Academy</button>{error ? <div className="error">{error}</div> : null}<a className="academyBack" href="/">Back to BM OS</a></section></main>;

  const percent = modules.length ? Math.round(completed.size / modules.length * 100) : 0;
  return <main className="academyApp">
    <header className="academyTopbar"><div><div className="brand">BM ACADEMY</div><span>Part of BM OS</span></div><div className="academyUser"><strong>{user.name}</strong><span>{user.jobTitle || 'No job title'} · {user.location}</span><button onClick={signOut}>Sign Out</button></div></header>
    <section className="academyHero"><div><span className="osEyebrow">Your required curriculum</span><h1>Welcome back, {user.name.split(' ')[0]}</h1><p>Your training is assigned automatically from your BM OS job title.</p></div><div className="academyProgress"><strong>{percent}%</strong><span>{completed.size} of {modules.length} complete</span><div><i style={{ width: `${percent}%` }} /></div></div></section>
    {modules.length === 0 ? <section className="managerCard"><h2>No training assigned yet</h2><p>Your administrator can assign curriculum to your job title in BM OS.</p></section> : Object.entries(grouped).map(([school, schoolModules]) => <section key={school} className="academySchool"><div className="sectionHeading"><div><h2>{school}</h2><p>{schoolModules.filter(module => completed.has(module.code)).length} of {schoolModules.length} complete</p></div></div><div className="academyModuleGrid">{schoolModules.map((module, index) => <button key={module.code} className={`academyModule ${completed.has(module.code) ? 'complete' : ''}`} onClick={() => openModule(module)}><span>{completed.has(module.code) ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{module.title}</strong><small>{module.summary}</small><b>{completed.has(module.code) ? 'Review module' : 'Start module'} →</b></button>)}</div></section>)}
    {selected ? <div className="academyModal" role="dialog" aria-modal="true" aria-label={selected.title}><article><button className="academyClose" onClick={() => setSelected(null)} aria-label="Close">×</button><span className="osEyebrow">{selected.school}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div className="academyLessonSections">{selected.sections.map(([heading, body]) => <section key={heading}><strong>{heading}</strong><p>{body}</p></section>)}</div><div className="academyQuiz"><h3>Knowledge Check</h3><p>Answer all five questions. You need 4 correct (80%) to pass.</p>{selected.quiz.map((question, questionIndex) => <fieldset key={question.question}><legend>{questionIndex + 1}. {question.question}</legend>{question.answers.map((answer, answerIndex) => <label key={answer}><input type="radio" name={`question-${questionIndex}`} checked={answers[questionIndex] === answerIndex} onChange={() => setAnswers(current => current.map((value, index) => index === questionIndex ? answerIndex : value))}/>{answer}</label>)}</fieldset>)}<button className="primary" onClick={grade}>Grade Quiz</button>{result ? <p className="academyResult">{result}</p> : null}</div>{selected.practical?.length ? <section className="academyPractical"><h3>Manager Practical Checkoff</h3>{selected.practical.map(item => <p key={item}>• {item}</p>)}</section> : null}{completed.has(selected.code) ? <footer className="academyLessonComplete"><div><strong>Lesson passed</strong><span>{nextModule ? 'Keep going with your next assigned lesson.' : 'You completed your final assigned lesson.'}</span></div><button className="primary" onClick={() => advanceLesson(nextModule)}>{nextModule ? `Next Lesson: ${nextModule.title} →` : 'Finish Academy'}</button></footer> : null}</article></div> : null}
  </main>;
}
