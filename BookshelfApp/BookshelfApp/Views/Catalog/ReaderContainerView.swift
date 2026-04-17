import SwiftUI

/// Routes to the correct reader based on book format.
struct ReaderContainerView: View {
    let book: LocalBook
    @Environment(\.modelContext) private var modelContext

    var body: some View {
        Group {
            if book.isEPUB {
                EPUBReaderView(book: book)
            } else if book.isPDF {
                PDFReaderView(book: book)
            } else {
                unsupportedFormatView
            }
        }
        .onAppear {
            book.lastOpened = Date()
            try? modelContext.save()
        }
    }

    private var unsupportedFormatView: some View {
        ContentUnavailableView {
            Label("Unsupported Format", systemImage: "doc.questionmark")
        } description: {
            Text("The \(book.formatDisplayName) format is not yet supported by the built-in reader.")
        }
    }
}
