//! argparse for the scripts whose parsers take only `store_true` flags: abbreviations,
//! `--` handling, an optional mutually exclusive group and argparse's error order
//! (conflicts and explicit values as they are met, help as it is met, then a required
//! group, then unrecognized arguments).

pub struct Parser {
    /// `prog`, the script's file name.
    pub prog: &'static str,
    /// The usage line, with its trailing newline.
    pub usage: &'static str,
    /// The full `--help` text.
    pub help: &'static str,
    /// Every long flag, such as `--write`.
    pub flags: &'static [&'static str],
    /// A mutually exclusive group and whether one of it is required.
    pub exclusive: &'static [&'static str],
    pub required: bool,
}

/// The flags given, or the exit code after argparse printed help or an error.
pub enum Parsed {
    Flags(Vec<&'static str>),
    Exit(u8),
}

impl Parser {
    fn error(&self, message: &str) -> Parsed {
        let _ = crate::print_text(
            &format!("{}{}: error: {message}\n", self.usage, self.prog),
            true,
        );
        Parsed::Exit(2)
    }

    pub fn parse(&self, args: &[String]) -> Parsed {
        let mut seen: Vec<&'static str> = Vec::new();
        let mut unrecognized: Vec<&str> = Vec::new();
        let mut positional_only = false;
        for arg in args {
            if positional_only || !arg.starts_with('-') || arg == "-" {
                unrecognized.push(arg);
                continue;
            }
            if arg == "--" {
                // With no positional parameters, argparse reports every `--` as unrecognized.
                positional_only = true;
                unrecognized.push(arg);
                continue;
            }
            let (name, explicit) = match arg.split_once('=') {
                Some((name, value)) if arg.starts_with("--") => (name, Some(value)),
                _ => (arg.as_str(), None),
            };
            let option = if name == "-h" {
                Some("--help")
            } else if name.len() > 2 && name.starts_with("--") {
                let all = std::iter::once("--help").chain(self.flags.iter().copied());
                let exact = all.clone().find(|option| *option == name);
                let matches: Vec<&str> = all.filter(|option| option.starts_with(name)).collect();
                match (exact, matches.as_slice()) {
                    (Some(exact), _) => Some(exact),
                    (None, [one]) => Some(*one),
                    (None, []) => None,
                    (None, many) => {
                        return self.error(&format!(
                            "ambiguous option: {name} could match {}",
                            many.join(", ")
                        ));
                    }
                }
            } else {
                None
            };
            let Some(option) = option else {
                unrecognized.push(arg);
                continue;
            };
            let display = if option == "--help" {
                "-h/--help"
            } else {
                option
            };
            if let Some(value) = explicit {
                return self.error(&format!(
                    "argument {display}: ignored explicit argument {}",
                    crate::py::repr_str(value)
                ));
            }
            if option == "--help" {
                let _ = crate::print_text(self.help, false);
                return Parsed::Exit(0);
            }
            if self.exclusive.contains(&option)
                && let Some(other) = seen
                    .iter()
                    .find(|s| self.exclusive.contains(s) && **s != option)
            {
                return self.error(&format!(
                    "argument {option}: not allowed with argument {other}"
                ));
            }
            if !seen.contains(&option) {
                seen.push(option);
            }
        }
        if self.required && !seen.iter().any(|s| self.exclusive.contains(s)) {
            return self.error(&format!(
                "one of the arguments {} is required",
                self.exclusive.join(" ")
            ));
        }
        if !unrecognized.is_empty() {
            return self.error(&format!(
                "unrecognized arguments: {}",
                unrecognized.join(" ")
            ));
        }
        Parsed::Flags(seen)
    }
}
