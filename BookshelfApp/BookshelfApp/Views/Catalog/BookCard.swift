import SwiftUI

// MARK: - Book Card (Plex-style, 2:3 ratio)

struct BookCard: View {
    let entry: OPDSEntry
    let server: ServerConfig
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            coverView
            titleView
        }
        .padding(4)
    }

    // MARK: - Cover

    private var coverView: some View {
        Color.clear
            .aspectRatio(3/4, contentMode: .fit)
            .overlay {
                AsyncCoverImage(url: entry.coverURL, server: server)
            }
            .overlay(alignment: .bottom) {
                if isHovered {
                    LinearGradient(
                        colors: [BookshelfTheme.accent.opacity(0.0), BookshelfTheme.accent.opacity(0.18)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous))
            .shadow(color: BookshelfTheme.coverShadow, radius: 8, y: 4)
            .overlay(
                RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous)
                    .stroke(
                        isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border,
                        lineWidth: isHovered ? 1.5 : 1
                    )
            )
            .scaleEffect(isHovered ? 1.03 : 1.0)
            .animation(.easeInOut(duration: 0.18), value: isHovered)
            .onHover { isHovered = $0 }
    }

    // MARK: - Title + Author

    private var titleView: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(entry.title)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
                .foregroundStyle(isHovered ? BookshelfTheme.accent : .white)
                .animation(.easeInOut(duration: 0.15), value: isHovered)

            if !entry.authors.isEmpty {
                Text(entry.authors.joined(separator: ", "))
                    .font(.system(size: 11))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .lineLimit(1)
            }
        }
    }
}

// MARK: - Navigation Card (categories / folders)

struct NavigationCard: View {
    let entry: OPDSEntry
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: iconForEntry(entry))
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(BookshelfTheme.accent)
                .frame(width: 40, height: 40)
                .background(BookshelfTheme.accent.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)

                if let summary = entry.summary {
                    Text(summary)
                        .font(.system(size: 12))
                        .foregroundStyle(BookshelfTheme.mutedText)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(BookshelfTheme.dimText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(isHovered ? BookshelfTheme.surfaceRaised : BookshelfTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.15), value: isHovered)
        .onHover { isHovered = $0 }
    }

    private func iconForEntry(_ entry: OPDSEntry) -> String {
        let t = entry.title.lowercased()
        if t.contains("new") || t.contains("recent") { return "sparkles" }
        if t.contains("author") { return "person.2.fill" }
        if t.contains("genre") || t.contains("categor") { return "tag.fill" }
        if t.contains("popular") || t.contains("most") { return "flame.fill" }
        if t.contains("search") { return "magnifyingglass" }
        if t.contains("all") { return "books.vertical.fill" }
        return "folder.fill"
    }
}

// MARK: - Authenticated Cover Image

struct AsyncCoverImage: View {
    let url: String?
    let server: ServerConfig
    @State private var imageData: Data?
    @State private var isLoading = true

    var body: some View {
        Group {
            if let imageData, let image = platformImage(from: imageData) {
                image
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else if isLoading {
                BookshelfTheme.surface
                    .overlay {
                        ProgressView()
                            .controlSize(.small)
                            .tint(BookshelfTheme.mutedText)
                    }
            } else {
                BookshelfTheme.surface
                    .overlay {
                        VStack(spacing: 6) {
                            Image(systemName: "book.closed.fill")
                                .font(.system(size: 28))
                                .foregroundStyle(BookshelfTheme.dimText)
                        }
                    }
            }
        }
        .task {
            await loadImage()
        }
    }

    private func loadImage() async {
        guard let url else { isLoading = false; return }
        let client = NetworkClient(server: server)
        do {
            let data = try await client.downloadImageData(from: url)
            self.imageData = data
        } catch {}
        isLoading = false
    }

    #if os(macOS)
    private func platformImage(from data: Data) -> Image? {
        guard let nsImage = NSImage(data: data) else { return nil }
        return Image(nsImage: nsImage)
    }
    #else
    private func platformImage(from data: Data) -> Image? {
        guard let uiImage = UIImage(data: data) else { return nil }
        return Image(uiImage: uiImage)
    }
    #endif
}
