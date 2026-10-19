//! Link-checker transport probe for the Hub harness: each stdin line is a JSON case
//! `{"hrefs": [...], "answers": {url: [answer, ...]}, "now": seconds, "actions": bool}`
//! where an answer is `{"ok": [status, final_url, body]}`, `{"http": [code, reason,
//! retry_after]}`, `{"url": reason}` or `{"timeout": message}`; a URL's answers are
//! served in order, the last repeating, and an unknown URL times out. Each output line
//! holds the failures, the printed lines, the sleeps and the requests made.
use site_tools::check_links::{Checker, Clock, NetError, Opened, Opener};
use site_tools::pyjson::{self, Dump, Json};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::BufRead;
use std::rc::Rc;

struct Stub {
    answers: Vec<(String, Json)>,
    served: HashMap<String, usize>,
    requests: Rc<RefCell<Vec<String>>>,
}

fn s(value: &Json) -> String {
    match value {
        Json::Str(s) => s.clone(),
        other => other.py_str(),
    }
}

impl Opener for Stub {
    fn open(&mut self, url: &str, _: &[(&str, String)]) -> Result<Opened, NetError> {
        self.requests.borrow_mut().push(url.to_owned());
        let Some((_, Json::Array(list))) = self.answers.iter().find(|(k, _)| k == url) else {
            return Err(NetError::Timeout("timed out".into()));
        };
        let index = self.served.entry(url.to_owned()).or_insert(0);
        let answer = &list[(*index).min(list.len() - 1)];
        *index += 1;
        if let Some(Json::Array(ok)) = answer.get("ok") {
            let Json::Int(status) = &ok[0] else {
                panic!("status")
            };
            return Ok(Opened {
                status: u16::try_from(status.clone()).unwrap(),
                url: s(&ok[1]),
                body: s(&ok[2]).into_bytes(),
            });
        }
        if let Some(Json::Array(http)) = answer.get("http") {
            let Json::Int(code) = &http[0] else {
                panic!("code")
            };
            return Err(NetError::Http {
                code: u16::try_from(code.clone()).unwrap(),
                reason: s(&http[1]),
                retry_after: match &http[2] {
                    Json::Null => None,
                    other => Some(s(other)),
                },
            });
        }
        if let Some(reason) = answer.get("url") {
            return Err(NetError::Url(s(reason)));
        }
        Err(NetError::Timeout(s(answer.get("timeout").unwrap())))
    }
}

struct FakeClock {
    now: f64,
    sleeps: Rc<RefCell<Vec<f64>>>,
}

impl Clock for FakeClock {
    fn sleep(&mut self, seconds: f64) {
        self.sleeps.borrow_mut().push(seconds);
    }

    fn now(&mut self) -> f64 {
        self.now
    }
}

fn main() {
    for line in std::io::stdin().lock().lines() {
        let case = pyjson::loads(&line.unwrap()).unwrap();
        let Some(Json::Object(answers)) = case.get("answers") else {
            panic!("answers")
        };
        let Some(Json::Array(hrefs)) = case.get("hrefs") else {
            panic!("hrefs")
        };
        let hrefs: Vec<String> = hrefs.iter().map(s).collect();
        let requests = Rc::new(RefCell::new(Vec::new()));
        let sleeps = Rc::new(RefCell::new(Vec::new()));
        let printed = Rc::new(RefCell::new(Vec::new()));
        let mut opener = Stub {
            answers: answers.clone(),
            served: HashMap::new(),
            requests: requests.clone(),
        };
        let now = match case.get("now") {
            Some(Json::Float(f)) => *f,
            Some(Json::Int(i)) => num_traits::ToPrimitive::to_f64(i).unwrap(),
            _ => 0.0,
        };
        let mut clock = FakeClock {
            now,
            sleeps: sleeps.clone(),
        };
        let sink = printed.clone();
        let mut out = move |line: &str| sink.borrow_mut().push(line.to_owned());
        let root = std::env::current_dir().unwrap();
        let mut checker = Checker::new(root, &mut opener, &mut clock, &mut out);
        checker.actions = matches!(case.get("actions"), Some(Json::Bool(true)));
        let failures = match checker.check_hrefs("page.html", &hrefs, false) {
            Ok(failures) => Json::Array(failures.into_iter().map(Json::Str).collect()),
            Err(error) => Json::Str(error.split(':').next().unwrap_or("").to_owned()),
        };
        drop(checker);
        let out = Json::Array(vec![
            failures,
            Json::Array(printed.borrow().iter().cloned().map(Json::Str).collect()),
            Json::Array(sleeps.borrow().iter().map(|f| Json::Float(*f)).collect()),
            Json::Array(requests.borrow().iter().cloned().map(Json::Str).collect()),
        ]);
        println!("{}", pyjson::dumps(&out, Dump::default()));
    }
}
