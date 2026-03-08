use std::io;
use std::time::Duration;

use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{
        Block, BorderType, Borders, Gauge, List, ListItem, ListState, Paragraph, Row, Table, Wrap,
    },
    Frame, Terminal,
};

#[derive(Clone, Copy, PartialEq)]
enum Component {
    Buttons,
    Lists,
    Tables,
    Gauges,
    Paragraphs,
    Colors,
}

impl Component {
    const ALL: [Component; 6] = [
        Component::Buttons,
        Component::Lists,
        Component::Tables,
        Component::Gauges,
        Component::Paragraphs,
        Component::Colors,
    ];

    fn next(self) -> Self {
        let index = Self::ALL.iter().position(|&c| c == self).unwrap();
        Self::ALL[(index + 1) % Self::ALL.len()]
    }

    fn previous(self) -> Self {
        let index = Self::ALL.iter().position(|&c| c == self).unwrap();
        Self::ALL[(index + Self::ALL.len() - 1) % Self::ALL.len()]
    }

    fn name(&self) -> &str {
        match self {
            Component::Buttons => "Buttons",
            Component::Lists => "Lists",
            Component::Tables => "Tables",
            Component::Gauges => "Gauges",
            Component::Paragraphs => "Paragraphs",
            Component::Colors => "Colors",
        }
    }
}

struct App {
    selected_component: Component,
    list_state: ListState,
    list_items: Vec<String>,
    tick: u64,
}

impl App {
    fn new() -> Self {
        let mut list_state = ListState::default();
        list_state.select(Some(0));

        Self {
            selected_component: Component::Buttons,
            list_state,
            list_items: vec![
                "Item 1: First item".to_string(),
                "Item 2: Second item".to_string(),
                "Item 3: Third item".to_string(),
                "Item 4: Fourth item".to_string(),
                "Item 5: Fifth item".to_string(),
            ],
            tick: 0,
        }
    }

    fn next_component(&mut self) {
        self.selected_component = self.selected_component.next();
    }

    fn previous_component(&mut self) {
        self.selected_component = self.selected_component.previous();
    }

    fn next_list_item(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i >= self.list_items.len() - 1 {
                    0
                } else {
                    i + 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn previous_list_item(&mut self) {
        let i = match self.list_state.selected() {
            Some(i) => {
                if i == 0 {
                    self.list_items.len() - 1
                } else {
                    i - 1
                }
            }
            None => 0,
        };
        self.list_state.select(Some(i));
    }

    fn tick(&mut self) {
        self.tick = self.tick.wrapping_add(1);
    }
}

fn main() -> io::Result<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app and run
    let app = App::new();
    let res = run_app(&mut terminal, app);

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        eprintln!("Error: {:?}", err);
    }

    Ok(())
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    mut app: App,
) -> io::Result<()> {
    loop {
        terminal.draw(|f| ui(f, &mut app))?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    match key.code {
                        KeyCode::Char('q') => return Ok(()),
                        KeyCode::Right | KeyCode::Char('l') => app.next_component(),
                        KeyCode::Left | KeyCode::Char('h') => app.previous_component(),
                        KeyCode::Down | KeyCode::Char('j') => {
                            if app.selected_component == Component::Lists {
                                app.next_list_item();
                            }
                        }
                        KeyCode::Up | KeyCode::Char('k') => {
                            if app.selected_component == Component::Lists {
                                app.previous_list_item();
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        app.tick();
    }
}

fn ui(f: &mut Frame, app: &mut App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .margin(1)
        .constraints([
            Constraint::Length(4),
            Constraint::Min(0),
            Constraint::Length(3),
        ])
        .split(f.size());

    render_header(f, chunks[0]);
    render_tabs(f, app, chunks[1]);
    render_footer(f, app, chunks[2]);
}

fn render_header(f: &mut Frame, area: Rect) {
    let header = Paragraph::new(vec![
        Line::from(vec![
            Span::styled(
                " RATATUI ",
                Style::default()
                    .fg(Color::Black)
                    .bg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" "),
            Span::styled(
                "Playground",
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::raw(" - Component Showcase"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled("←/→ h/l", Style::default().fg(Color::Yellow)),
            Span::raw(" switch components  "),
            Span::styled("↑/↓ j/k", Style::default().fg(Color::Yellow)),
            Span::raw(" navigate lists  "),
            Span::styled("q", Style::default().fg(Color::Red)),
            Span::raw(" quit"),
        ]),
    ])
    .block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded),
    )
    .alignment(Alignment::Center);

    f.render_widget(header, area);
}

fn render_tabs(f: &mut Frame, app: &mut App, area: Rect) {
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Rounded)
        .title(format!(" {} ", app.selected_component.name()))
        .title_style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD));

    let inner = block.inner(area);
    f.render_widget(block, area);

    match app.selected_component {
        Component::Buttons => render_buttons(f, inner),
        Component::Lists => render_list(f, app, inner),
        Component::Tables => render_table(f, inner),
        Component::Gauges => render_gauges(f, app, inner),
        Component::Paragraphs => render_paragraphs(f, inner),
        Component::Colors => render_colors(f, inner),
    }
}

fn render_footer(f: &mut Frame, app: &App, area: Rect) {
    let tabs: Vec<Span> = Component::ALL
        .iter()
        .map(|c| {
            if *c == app.selected_component {
                Span::styled(
                    format!(" {} ", c.name()),
                    Style::default()
                        .fg(Color::Black)
                        .bg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                )
            } else {
                Span::styled(
                    format!(" {} ", c.name()),
                    Style::default().fg(Color::DarkGray),
                )
            }
        })
        .collect();

    let footer = Paragraph::new(Line::from(tabs))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded),
        )
        .alignment(Alignment::Center);

    f.render_widget(footer, area);
}

fn render_buttons(f: &mut Frame, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(0),
        ])
        .margin(1)
        .split(area);

    let buttons = [
        ("Primary", Color::Blue, Color::White),
        ("Success", Color::Green, Color::White),
        ("Warning", Color::Yellow, Color::Black),
        ("Danger", Color::Red, Color::White),
    ];

    for (i, (label, bg, fg)) in buttons.iter().enumerate() {
        let button = Paragraph::new(format!("  {}  ", label))
            .style(Style::default().fg(*fg).bg(*bg))
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded)
                    .border_style(Style::default().fg(*bg)),
            )
            .alignment(Alignment::Center);
        f.render_widget(button, chunks[i]);
    }
}

fn render_list(f: &mut Frame, app: &mut App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .margin(1)
        .split(area);

    // Interactive list
    let items: Vec<ListItem> = app
        .list_items
        .iter()
        .map(|item| ListItem::new(item.as_str()))
        .collect();

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Interactive (j/k) "),
        )
        .highlight_style(
            Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        )
        .highlight_symbol("▶ ");

    f.render_stateful_widget(list, chunks[0], &mut app.list_state);

    // Styled list
    let styled_items = vec![
        ListItem::new("✓ Completed task").style(Style::default().fg(Color::Green)),
        ListItem::new("● In progress").style(Style::default().fg(Color::Yellow)),
        ListItem::new("○ Pending task").style(Style::default().fg(Color::Gray)),
        ListItem::new("✗ Failed task").style(Style::default().fg(Color::Red)),
        ListItem::new("★ Starred item").style(Style::default().fg(Color::Cyan)),
    ];

    let styled_list = List::new(styled_items).block(
        Block::default()
            .borders(Borders::ALL)
            .border_type(BorderType::Rounded)
            .title(" Styled Items "),
    );

    f.render_widget(styled_list, chunks[1]);
}

fn render_table(f: &mut Frame, area: Rect) {
    let header = Row::new(vec!["ID", "Name", "Email", "Status"])
        .style(
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )
        .bottom_margin(1);

    let rows = vec![
        Row::new(vec!["1", "John Doe", "john@example.com", "Active"]),
        Row::new(vec!["2", "Jane Smith", "jane@example.com", "Active"]),
        Row::new(vec!["3", "Bob Johnson", "bob@example.com", "Inactive"])
            .style(Style::default().fg(Color::DarkGray)),
        Row::new(vec!["4", "Alice Brown", "alice@example.com", "Active"]),
        Row::new(vec!["5", "Charlie", "charlie@example.com", "Pending"])
            .style(Style::default().fg(Color::Yellow)),
    ];

    let widths = [
        Constraint::Length(4),
        Constraint::Min(15),
        Constraint::Min(20),
        Constraint::Length(10),
    ];

    let table = Table::new(rows, widths)
        .header(header)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" User Table "),
        )
        .column_spacing(2);

    f.render_widget(table, area);
}

fn render_gauges(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(0),
        ])
        .margin(1)
        .split(area);

    // Animated gauges
    let cpu = ((app.tick as f64 * 0.05).sin() * 30.0 + 50.0) as u16;
    let mem = ((app.tick as f64 * 0.03).cos() * 20.0 + 60.0) as u16;
    let disk = 85u16;
    let net = ((app.tick as f64 * 0.08).sin() * 40.0 + 50.0) as u16;

    let gauges = [
        ("CPU Usage", cpu, Color::Green),
        ("Memory", mem, Color::Yellow),
        ("Disk", disk, Color::Red),
        ("Network", net, Color::Cyan),
    ];

    for (i, (label, pct, color)) in gauges.iter().enumerate() {
        let gauge = Gauge::default()
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_type(BorderType::Rounded)
                    .title(format!(" {} ", label)),
            )
            .gauge_style(Style::default().fg(*color).bg(Color::Black))
            .percent(*pct)
            .label(format!("{}%", pct));

        f.render_widget(gauge, chunks[i]);
    }
}

fn render_paragraphs(f: &mut Frame, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .margin(1)
        .split(area);

    let styled_text = Text::from(vec![
        Line::from(vec![Span::styled(
            "Rich Text Formatting",
            Style::default()
                .fg(Color::Cyan)
                .add_modifier(Modifier::BOLD | Modifier::UNDERLINED),
        )]),
        Line::from(""),
        Line::from(vec![
            Span::raw("You can use "),
            Span::styled("colors", Style::default().fg(Color::Green)),
            Span::raw(", "),
            Span::styled("bold", Style::default().add_modifier(Modifier::BOLD)),
            Span::raw(", "),
            Span::styled("italic", Style::default().add_modifier(Modifier::ITALIC)),
            Span::raw(", and "),
            Span::styled(
                "combinations",
                Style::default()
                    .fg(Color::Magenta)
                    .add_modifier(Modifier::BOLD | Modifier::ITALIC),
            ),
            Span::raw("!"),
        ]),
        Line::from(""),
        Line::from(vec![
            Span::styled(
                "Underline",
                Style::default().add_modifier(Modifier::UNDERLINED),
            ),
            Span::raw(" | "),
            Span::styled(
                "Strikethrough",
                Style::default().add_modifier(Modifier::CROSSED_OUT),
            ),
            Span::raw(" | "),
            Span::styled("Dim", Style::default().add_modifier(Modifier::DIM)),
        ]),
    ]);

    let para1 = Paragraph::new(styled_text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Styled Text "),
        )
        .wrap(Wrap { trim: true });

    f.render_widget(para1, chunks[0]);

    let lorem = "Ratatui is a Rust library for building rich terminal user interfaces (TUIs). \
        It provides a wide variety of widgets including paragraphs, lists, tables, gauges, \
        charts, and more. The library supports multiple backends including crossterm, \
        termion, and termwiz. It's actively maintained and has excellent documentation.";

    let para2 = Paragraph::new(lorem)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Wrapped Text "),
        )
        .wrap(Wrap { trim: true })
        .style(Style::default().fg(Color::Gray));

    f.render_widget(para2, chunks[1]);
}

fn render_colors(f: &mut Frame, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Min(0),
        ])
        .margin(1)
        .split(area);

    // Basic colors
    let basic_colors = vec![
        ("Black", Color::Black, Color::White),
        ("Red", Color::Red, Color::Black),
        ("Green", Color::Green, Color::Black),
        ("Yellow", Color::Yellow, Color::Black),
        ("Blue", Color::Blue, Color::White),
        ("Magenta", Color::Magenta, Color::Black),
        ("Cyan", Color::Cyan, Color::Black),
        ("White", Color::White, Color::Black),
    ];

    let color_spans: Vec<Span> = basic_colors
        .iter()
        .map(|(name, bg, fg)| {
            Span::styled(format!(" {} ", name), Style::default().fg(*fg).bg(*bg))
        })
        .collect();

    let basic = Paragraph::new(Line::from(color_spans))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Basic Colors "),
        )
        .alignment(Alignment::Center);

    f.render_widget(basic, chunks[0]);

    // Light colors
    let light_colors = vec![
        ("LightRed", Color::LightRed),
        ("LightGreen", Color::LightGreen),
        ("LightYellow", Color::LightYellow),
        ("LightBlue", Color::LightBlue),
        ("LightMagenta", Color::LightMagenta),
        ("LightCyan", Color::LightCyan),
        ("Gray", Color::Gray),
        ("DarkGray", Color::DarkGray),
    ];

    let light_spans: Vec<Span> = light_colors
        .iter()
        .map(|(name, color)| {
            Span::styled(
                format!(" {} ", name),
                Style::default().fg(Color::Black).bg(*color),
            )
        })
        .collect();

    let light = Paragraph::new(Line::from(light_spans))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" Light Colors "),
        )
        .alignment(Alignment::Center);

    f.render_widget(light, chunks[1]);

    // RGB gradient
    let gradient_area = chunks[2];
    let width = gradient_area.width.saturating_sub(4) as usize;

    let mut gradient_spans = Vec::new();
    for i in 0..width {
        let hue = (i as f64 / width as f64) * 360.0;
        let (r, g, b) = hsl_to_rgb(hue, 1.0, 0.5);
        gradient_spans.push(Span::styled("█", Style::default().fg(Color::Rgb(r, g, b))));
    }

    let gradient = Paragraph::new(Line::from(gradient_spans))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title(" RGB Gradient "),
        )
        .alignment(Alignment::Left);

    f.render_widget(gradient, gradient_area);
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (u8, u8, u8) {
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let x = c * (1.0 - ((h / 60.0) % 2.0 - 1.0).abs());
    let m = l - c / 2.0;

    let (r, g, b) = match h as u32 {
        0..=59 => (c, x, 0.0),
        60..=119 => (x, c, 0.0),
        120..=179 => (0.0, c, x),
        180..=239 => (0.0, x, c),
        240..=299 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    (
        ((r + m) * 255.0) as u8,
        ((g + m) * 255.0) as u8,
        ((b + m) * 255.0) as u8,
    )
}
