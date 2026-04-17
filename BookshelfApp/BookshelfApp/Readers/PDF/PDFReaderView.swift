import SwiftUI
import PDFKit

/// Native PDF reader using PDFKit.
struct PDFReaderView: View {
    let book: LocalBook
    @Environment(\.modelContext) private var modelContext
    @State private var pdfDocument: PDFDocument?
    @State private var currentPage = 0
    @State private var totalPages = 0
    @State private var error: String?
    @State private var showThumbnails = false

    var body: some View {
        Group {
            if let error {
                ContentUnavailableView {
                    Label("Error", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                }
            } else if let document = pdfDocument {
                VStack(spacing: 0) {
                    PDFKitView(document: document, currentPage: $currentPage)
                        .ignoresSafeArea(edges: .bottom)

                    // Bottom bar
                    HStack {
                        Button {
                            showThumbnails.toggle()
                        } label: {
                            Image(systemName: "square.grid.2x2")
                        }

                        Spacer()

                        Text("Page \(currentPage + 1) of \(totalPages)")
                            .font(.caption)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)

                        Spacer()

                        ProgressView(value: Double(currentPage + 1), total: Double(max(totalPages, 1)))
                            .frame(width: 100)
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 8)
                    .background(.bar)
                }
            } else {
                ProgressView("Opening PDF...")
            }
        }
        .navigationTitle(book.title)
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .onAppear {
            loadPDF()
        }
        .onDisappear {
            saveProgress()
        }
        .onChange(of: currentPage) { _, _ in
            saveProgress()
        }
        .sheet(isPresented: $showThumbnails) {
            if let document = pdfDocument {
                PDFThumbnailGrid(document: document, currentPage: $currentPage, showThumbnails: $showThumbnails)
            }
        }
    }

    private func loadPDF() {
        let url = book.bookFileURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            error = "PDF file not found"
            return
        }

        guard let doc = PDFDocument(url: url) else {
            error = "Could not open PDF"
            return
        }

        pdfDocument = doc
        totalPages = doc.pageCount

        // Restore position
        let savedPage = Int(book.readingProgress * Double(max(totalPages - 1, 1)))
        currentPage = min(savedPage, totalPages - 1)
    }

    private func saveProgress() {
        guard totalPages > 0 else { return }
        book.readingProgress = Double(currentPage) / Double(max(totalPages - 1, 1))
        book.lastOpened = Date()
        try? modelContext.save()
    }
}

// MARK: - PDFKit View

#if os(macOS)
struct PDFKitView: NSViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int

    func makeNSView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.displayMode = .singlePage
        pdfView.autoScales = true

        // Go to saved page
        if let page = document.page(at: currentPage) {
            pdfView.go(to: page)
        }

        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.pageChanged(_:)),
            name: .PDFViewPageChanged,
            object: pdfView
        )

        return pdfView
    }

    func updateNSView(_ pdfView: PDFView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPage: $currentPage, document: document)
    }

    class Coordinator: NSObject {
        @Binding var currentPage: Int
        let document: PDFDocument

        init(currentPage: Binding<Int>, document: PDFDocument) {
            self._currentPage = currentPage
            self.document = document
        }

        @objc func pageChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView,
                  let page = pdfView.currentPage,
                  let pageIndex = document.index(for: page) as Int? else { return }
            DispatchQueue.main.async {
                self.currentPage = pageIndex
            }
        }
    }
}
#else
struct PDFKitView: UIViewRepresentable {
    let document: PDFDocument
    @Binding var currentPage: Int

    func makeUIView(context: Context) -> PDFView {
        let pdfView = PDFView()
        pdfView.document = document
        pdfView.displayMode = .singlePage
        pdfView.autoScales = true
        pdfView.displayDirection = .horizontal
        pdfView.usePageViewController(true)

        // Go to saved page
        if let page = document.page(at: currentPage) {
            pdfView.go(to: page)
        }

        NotificationCenter.default.addObserver(
            context.coordinator,
            selector: #selector(Coordinator.pageChanged(_:)),
            name: .PDFViewPageChanged,
            object: pdfView
        )

        return pdfView
    }

    func updateUIView(_ pdfView: PDFView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(currentPage: $currentPage, document: document)
    }

    class Coordinator: NSObject {
        @Binding var currentPage: Int
        let document: PDFDocument

        init(currentPage: Binding<Int>, document: PDFDocument) {
            self._currentPage = currentPage
            self.document = document
        }

        @objc func pageChanged(_ notification: Notification) {
            guard let pdfView = notification.object as? PDFView,
                  let page = pdfView.currentPage,
                  let pageIndex = document.index(for: page) as Int? else { return }
            DispatchQueue.main.async {
                self.currentPage = pageIndex
            }
        }
    }
}
#endif

// MARK: - Thumbnail Grid

struct PDFThumbnailGrid: View {
    let document: PDFDocument
    @Binding var currentPage: Int
    @Binding var showThumbnails: Bool

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120))], spacing: 16) {
                    ForEach(0..<document.pageCount, id: \.self) { index in
                        Button {
                            currentPage = index
                            showThumbnails = false
                        } label: {
                            VStack(spacing: 4) {
                                PDFPageThumbnail(document: document, pageIndex: index)
                                    .frame(height: 160)
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(index == currentPage ? Color.accentColor : Color.clear, lineWidth: 3)
                                    )

                                Text("\(index + 1)")
                                    .font(.caption2)
                                    .foregroundStyle(index == currentPage ? .primary : .secondary)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .navigationTitle("Pages")
            #if !os(macOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { showThumbnails = false }
                }
            }
        }
    }
}

struct PDFPageThumbnail: View {
    let document: PDFDocument
    let pageIndex: Int

    var body: some View {
        Group {
            if let page = document.page(at: pageIndex) {
                let image = page.thumbnail(of: CGSize(width: 200, height: 280), for: .mediaBox)
                #if os(macOS)
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                #else
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                #endif
            } else {
                Rectangle()
                    .fill(.quaternary)
            }
        }
    }
}
