import SwiftUI
import WebKit

/// EPUB reader using WKWebView to render extracted EPUB content.
struct EPUBReaderView: View {
    let book: LocalBook
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel: EPUBReaderViewModel
    @State private var showSettings = false

    init(book: LocalBook) {
        self.book = book
        self._viewModel = State(initialValue: EPUBReaderViewModel(book: book))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView("Opening book...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = viewModel.error {
                ContentUnavailableView {
                    Label("Error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                }
            } else {
                epubContent
            }
        }
        .navigationTitle(book.title)
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button {
                    viewModel.goToPreviousChapter()
                } label: {
                    Image(systemName: "chevron.left")
                }
                .disabled(!viewModel.canGoPrevious)

                Button {
                    viewModel.goToNextChapter()
                } label: {
                    Image(systemName: "chevron.right")
                }
                .disabled(!viewModel.canGoNext)

                Button {
                    showSettings.toggle()
                } label: {
                    Image(systemName: "textformat.size")
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            ReaderSettingsSheet(viewModel: viewModel)
        }
        .task {
            await viewModel.loadBook()
        }
        .onDisappear {
            book.readingProgress = viewModel.progress
            try? modelContext.save()
        }
    }

    private var epubContent: some View {
        VStack(spacing: 0) {
            EPUBWebView(viewModel: viewModel)
                .ignoresSafeArea(edges: .bottom)

            // Bottom progress bar
            VStack(spacing: 4) {
                ProgressView(value: viewModel.progress)
                HStack {
                    Text(viewModel.currentChapterTitle)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    Text("\(Int(viewModel.progress * 100))%")
                        .font(.caption2)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 6)
            .background(.bar)
        }
    }
}

// MARK: - Reader Settings

struct ReaderSettingsSheet: View {
    let viewModel: EPUBReaderViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Font Size") {
                    Slider(value: Binding(
                        get: { viewModel.fontSize },
                        set: { viewModel.setFontSize($0) }
                    ), in: 12...32, step: 1) {
                        Text("Font Size")
                    }
                    Text("\(Int(viewModel.fontSize))pt")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Theme") {
                    Picker("Theme", selection: Binding(
                        get: { viewModel.theme },
                        set: { viewModel.setTheme($0) }
                    )) {
                        Text("Light").tag(EPUBReaderViewModel.ReaderTheme.light)
                        Text("Sepia").tag(EPUBReaderViewModel.ReaderTheme.sepia)
                        Text("Dark").tag(EPUBReaderViewModel.ReaderTheme.dark)
                    }
                    .pickerStyle(.segmented)
                }

                Section("Font Family") {
                    Picker("Font", selection: Binding(
                        get: { viewModel.fontFamily },
                        set: { viewModel.setFontFamily($0) }
                    )) {
                        Text("System").tag("system-ui")
                        Text("Georgia").tag("Georgia")
                        Text("Palatino").tag("Palatino")
                        Text("Charter").tag("Charter")
                        Text("Iowan Old Style").tag("Iowan Old Style")
                    }
                }
            }
            .navigationTitle("Reader Settings")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 350, minHeight: 300)
        #else
        .presentationDetents([.medium])
        #endif
    }
}

// MARK: - EPUB ViewModel

@Observable
class EPUBReaderViewModel {
    let book: LocalBook
    var isLoading = true
    var error: String?
    var progress: Double = 0
    var currentChapterIndex = 0
    var currentChapterTitle = ""
    var chapters: [EPUBChapter] = []
    var fontSize: Double = 18
    var theme: ReaderTheme = .light
    var fontFamily = "Georgia"

    weak var webView: WKWebView?

    enum ReaderTheme: String, CaseIterable {
        case light, sepia, dark

        var backgroundColor: String {
            switch self {
            case .light: return "#FFFFFF"
            case .sepia: return "#F4ECD8"
            case .dark: return "#1C1C1E"
            }
        }

        var textColor: String {
            switch self {
            case .light: return "#1C1C1E"
            case .sepia: return "#5B4636"
            case .dark: return "#E5E5E7"
            }
        }
    }

    struct EPUBChapter {
        let title: String
        let href: String
        let fullPath: URL
    }

    init(book: LocalBook) {
        self.book = book
        self.progress = book.readingProgress
    }

    var canGoPrevious: Bool { currentChapterIndex > 0 }
    var canGoNext: Bool { currentChapterIndex < chapters.count - 1 }

    @MainActor
    func loadBook() async {
        isLoading = true
        do {
            let extractor = EPUBExtractor()
            chapters = try extractor.extractChapters(from: book.bookFileURL)
            if !chapters.isEmpty {
                // Restore last position
                let targetIndex = Int(progress * Double(chapters.count - 1))
                currentChapterIndex = min(targetIndex, chapters.count - 1)
                loadCurrentChapter()
            }
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func goToNextChapter() {
        guard canGoNext else { return }
        currentChapterIndex += 1
        updateProgress()
        loadCurrentChapter()
    }

    func goToPreviousChapter() {
        guard canGoPrevious else { return }
        currentChapterIndex -= 1
        updateProgress()
        loadCurrentChapter()
    }

    func loadCurrentChapter() {
        guard currentChapterIndex < chapters.count else { return }
        let chapter = chapters[currentChapterIndex]
        currentChapterTitle = chapter.title.isEmpty ? "Chapter \(currentChapterIndex + 1)" : chapter.title
        webView?.loadFileURL(chapter.fullPath, allowingReadAccessTo: chapter.fullPath.deletingLastPathComponent().deletingLastPathComponent())
    }

    func setFontSize(_ size: Double) {
        fontSize = size
        injectStyles()
    }

    func setTheme(_ theme: ReaderTheme) {
        self.theme = theme
        injectStyles()
    }

    func setFontFamily(_ family: String) {
        fontFamily = family
        injectStyles()
    }

    func injectStyles() {
        let css = """
        document.body.style.fontFamily = '\(fontFamily), serif';
        document.body.style.fontSize = '\(Int(fontSize))px';
        document.body.style.lineHeight = '1.7';
        document.body.style.backgroundColor = '\(theme.backgroundColor)';
        document.body.style.color = '\(theme.textColor)';
        document.body.style.maxWidth = '750px';
        document.body.style.margin = '20px auto';
        document.body.style.padding = '0 20px';
        document.body.style.wordWrap = 'break-word';
        document.body.style.webkitHyphens = 'auto';

        // Style images
        var imgs = document.querySelectorAll('img');
        imgs.forEach(function(img) {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
        });
        """
        webView?.evaluateJavaScript(css)
    }

    private func updateProgress() {
        if chapters.count > 1 {
            progress = Double(currentChapterIndex) / Double(chapters.count - 1)
        }
    }
}

// MARK: - WKWebView Bridge

#if os(macOS)
struct EPUBWebView: NSViewRepresentable {
    let viewModel: EPUBReaderViewModel

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        viewModel.webView = webView
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        let viewModel: EPUBReaderViewModel

        init(viewModel: EPUBReaderViewModel) {
            self.viewModel = viewModel
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            viewModel.injectStyles()
        }
    }
}
#else
struct EPUBWebView: UIViewRepresentable {
    let viewModel: EPUBReaderViewModel

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.showsHorizontalScrollIndicator = false
        viewModel.webView = webView
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        let viewModel: EPUBReaderViewModel

        init(viewModel: EPUBReaderViewModel) {
            self.viewModel = viewModel
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            viewModel.injectStyles()
        }
    }
}
#endif
