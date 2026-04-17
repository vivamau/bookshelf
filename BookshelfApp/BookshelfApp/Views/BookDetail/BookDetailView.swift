import SwiftUI
import SwiftData

struct BookDetailView: View {
    let entry: OPDSEntry
    let server: ServerConfig
    let downloadManager: DownloadManager
    @Environment(\.modelContext) private var modelContext
    @Query private var localBooks: [LocalBook]
    @State private var isDownloading = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroSection
                contentSection
            }
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
        .navigationTitle(entry.title)
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .bookshelfNavBar()
    }

    // MARK: - Hero

    private var heroSection: some View {
        ZStack(alignment: .bottom) {
            // Blurred cover backdrop
            AsyncCoverImage(url: entry.coverURL, server: server)
                .aspectRatio(contentMode: .fill)
                .frame(maxWidth: .infinity)
                .frame(height: heroHeight)
                .clipped()
                .overlay(
                    LinearGradient(
                        colors: [
                            BookshelfTheme.background.opacity(0.1),
                            BookshelfTheme.background.opacity(0.7),
                            BookshelfTheme.background
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .blur(radius: 0)

            // Cover + metadata row
            HStack(alignment: .bottom, spacing: 20) {
                // Sharp cover on top of gradient
                AsyncCoverImage(url: entry.coverURL, server: server)
                    .aspectRatio(2/3, contentMode: .fill)
                    .frame(width: coverWidth, height: coverHeight)
                    .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius + 1, style: .continuous))
                    .shadow(color: .black.opacity(0.6), radius: 16, y: 8)
                    .overlay(
                        RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius + 1)
                            .stroke(Color.white.opacity(0.1), lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 10) {
                    Text(entry.title)
                        .font(.system(size: titleFontSize, weight: .bold))
                        .lineLimit(3)
                        .foregroundStyle(.white)

                    if !entry.authors.isEmpty {
                        Text(entry.authors.joined(separator: ", "))
                            .font(.system(size: 14))
                            .foregroundStyle(BookshelfTheme.mutedText)
                    }

                    if let format = entry.formatString {
                        HStack(spacing: 8) {
                            FormatBadge(text: format)
                            if let link = entry.bestDownloadLink, let length = link.length {
                                Text(ByteCountFormatter.string(fromByteCount: Int64(length), countStyle: .file))
                                    .font(.system(size: 11))
                                    .foregroundStyle(BookshelfTheme.dimText)
                            }
                        }
                    }

                    Spacer(minLength: 0)
                    downloadButton
                }
                .padding(.bottom, 20)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 4)
        }
    }

    // MARK: - Content (metadata + description)

    private var contentSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            if hasMetadata {
                metadataSection
                Divider()
                    .background(BookshelfTheme.border)
                    .padding(.horizontal, 20)
            }

            if let summary = entry.summary ?? entry.content, !summary.isEmpty {
                descriptionSection(summary)
            }

            if entry.acquisitionLinks.count > 1 {
                extraDownloadsSection
            }
        }
        .padding(.top, 8)
    }

    private var hasMetadata: Bool {
        !entry.categories.isEmpty || entry.language != nil || entry.publisher != nil || entry.isbn != nil || entry.published != nil
    }

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            BookshelfSectionHeader(title: "Details")

            if !entry.categories.isEmpty {
                metaRow(icon: "tag.fill", label: "Genres", value: entry.categories.joined(separator: " · "))
            }
            if let lang = entry.language {
                metaRow(icon: "globe", label: "Language", value: lang)
            }
            if let pub = entry.publisher {
                metaRow(icon: "building.2.fill", label: "Publisher", value: pub)
            }
            if let isbn = entry.isbn {
                metaRow(icon: "barcode", label: "ISBN", value: isbn)
            }
            if let date = entry.published {
                metaRow(icon: "calendar", label: "Published", value: date.formatted(date: .abbreviated, time: .omitted))
            }
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundStyle(BookshelfTheme.accent)
                .frame(width: 18)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(BookshelfTheme.dimText)
                Text(value)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
            }
        }
    }

    private func descriptionSection(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            BookshelfSectionHeader(title: "Description")

            Text(text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression))
                .font(.system(size: 14))
                .foregroundStyle(Color.white.opacity(0.8))
                .lineSpacing(4)
                .lineLimit(nil)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var extraDownloadsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            BookshelfSectionHeader(title: "Download Options")

            ForEach(entry.acquisitionLinks, id: \.href) { link in
                Button {
                    Task { await downloadBook() }
                } label: {
                    HStack {
                        Image(systemName: "arrow.down.circle.fill")
                            .foregroundStyle(BookshelfTheme.accent)
                        Text("Download \(link.fileExtension.uppercased())")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(.white)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(BookshelfTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(BookshelfTheme.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(20)
    }

    // MARK: - Download Button

    private var downloadButton: some View {
        Group {
            if let localBook = existingLocalBook {
                NavigationLink {
                    ReaderContainerView(book: localBook)
                } label: {
                    actionButtonLabel("Read Now", icon: "book.fill", filled: true)
                }
                .buttonStyle(.plain)
            } else if isDownloading {
                actionButtonLabel("Downloading…", icon: nil, filled: false, loading: true)
                    .opacity(0.6)
            } else if entry.bestDownloadLink != nil {
                Button {
                    Task { await downloadBook() }
                } label: {
                    actionButtonLabel("Download this", icon: "arrow.down.circle.fill", filled: true)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func actionButtonLabel(_ title: String, icon: String?, filled: Bool, loading: Bool = false) -> some View {
        HStack(spacing: 7) {
            if loading {
                ProgressView().controlSize(.small).tint(.white)
            } else if let icon {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold))
            }
            Text(title).font(.system(size: 14, weight: .bold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(filled ? BookshelfTheme.accent : BookshelfTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(filled ? Color.clear : BookshelfTheme.border, lineWidth: 1)
        )
    }

    // MARK: - Helpers

    private var existingLocalBook: LocalBook? {
        localBooks.first(where: { $0.sourceURL == entry.bestDownloadLink?.href })
    }

    private func downloadBook() async {
        isDownloading = true
        await downloadManager.downloadBook(entry: entry, server: server, modelContext: modelContext)
        isDownloading = false
    }

    // MARK: - Adaptive Sizing

    private var heroHeight: CGFloat {
        #if os(macOS)
        280
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 340 : 280
        #endif
    }

    private var coverWidth: CGFloat {
        #if os(macOS)
        120
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 140 : 110
        #endif
    }

    private var coverHeight: CGFloat { coverWidth * 1.5 }

    private var titleFontSize: CGFloat {
        #if os(macOS)
        20
        #else
        UIDevice.current.userInterfaceIdiom == .pad ? 22 : 18
        #endif
    }
}
