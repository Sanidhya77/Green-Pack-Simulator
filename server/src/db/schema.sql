CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  participant_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS baseline_responses (
  session_id TEXT PRIMARY KEY,
  thinks_sustainability TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS trial_choices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  part TEXT NOT NULL,
  trial_index INTEGER NOT NULL,
  product_key TEXT NOT NULL,
  option_id TEXT NOT NULL,
  price REAL NOT NULL,
  packaging_type TEXT NOT NULL,
  has_green_label INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, part, trial_index),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS post_choice_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  part TEXT NOT NULL,
  trial_index INTEGER NOT NULL,
  reason TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  reflection TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, part, trial_index),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS ai_explanations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  part TEXT NOT NULL,
  trial_index INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_excerpt TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS final_summaries (
  session_id TEXT PRIMARY KEY,
  price_focus_count INTEGER NOT NULL,
  sustainability_focus_count INTEGER NOT NULL,
  label_focus_count INTEGER NOT NULL,
  gut_focus_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
