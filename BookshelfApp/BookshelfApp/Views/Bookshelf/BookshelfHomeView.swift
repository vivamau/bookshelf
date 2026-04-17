import SwiftUI
import SwiftData

/// Root view for a Bookshelf server — uses the native REST API.
struct BookshelfHomeView: View {
    let server: ServerConfig
    @State private var vm: BookshelfViewModel
    @State private var downloadManager = DownloadManager()
    @Environment(\.modelContext) private var modelContext

    init(server: ServerConfig) {
        self.server = server
        self._vm = State(initialValue: BookshelfViewModel(server: server))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(server.name)
                #if !os(macOS)
                .navigationBarTitleDisplayMode(.large)
                #endif
                .bookshelfNavBar()
                .toolbar { toolbarContent }
                .searchable(text: $vm.searchQuery, prompt: "Search library")
                .onSubmit(of: .search) { Task { await vm.search() } }
                .onChange(of: vm.searchQuery) { _, new in
                    if new.isEmpty { vm.searchResults = [] }
                }
                .task { await vm.loadHome() }
                .refreshable { await vm.loadHome() }
                .environment(downloadManager)
        }
        .preferredColorScheme(.dark)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if !vm.searchQuery.isEmpty {
            searchResultsView
        } else if vm.isLoadingBooks && vm.books.isEmpty {
            loadingView
        } else if let error = vm.error, vm.books.isEmpty {
            errorView(error)
        } else {
            homeScrollView
        }
    }

    // MARK: - Home Scroll

    private var homeScrollView: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                continueReadingSection
                librarySection
            }
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
    }

    // MARK: - Continue Reading

    @ViewBuilder
    private var continueReadingSection: some View {
        if !vm.continueReading.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                BookshelfSectionHeader(title: "Continue Reading")
                    .padding(.horizontal, 16)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(vm.continueReading) { book in
                            NavigationLink {
                                BookshelfBookDetailView(
                                    bookId: book.bookID,
                                    server: server,
                                    downloadManager: downloadManager
                                )
                            } label: {
                                BookshelfContinueCard(book: book, client: vm.client)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 4)
                }
            }
            .padding(.top, 16)
            .padding(.bottom, 28)
        }
    }

    // MARK: - Library Grid

    private var librarySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                BookshelfSectionHeader(title: "All Books")
                Spacer()
                Text("\(vm.totalBooks)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(BookshelfTheme.mutedText)
            }
            .padding(.horizontal, 16)

            // Filter bar
            filterBar

            // Grid
            LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                ForEach(vm.books) { book in
                    NavigationLink {
                        BookshelfBookDetailView(
                            bookId: book.bookID,
                            server: server,
                            downloadManager: downloadManager
                        )
                    } label: {
                        BookshelfBookCard(book: book, client: vm.client)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)

            // Load more
            if vm.books.count < vm.totalBooks {
                Button {
                    Task { await vm.loadNextPage() }
                } label: {
                    if vm.isLoadingBooks {
                        ProgressView().tint(BookshelfTheme.accent)
                    } else {
                        Text("Load More")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(BookshelfTheme.accent)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 10)
                            .background(BookshelfTheme.accent.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(BookshelfTheme.accent.opacity(0.3), lineWidth: 1))
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                .padding(.bottom, 40)
            } else {
                Spacer(minLength: 40)
            }
        }
    }

    // MARK: - Filter bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // Sort
                filterChip(label: sortLabel, icon: "arrow.up.arrow.down") {
                    Menu {
                        Button("Recently Added") { Task { await vm.applySort("latest") } }
                        Button("By Title")       { Task { await vm.applySort("title") } }
                        Button("By Year")        { Task { await vm.applySort("year") } }
                        Button("By Progress")    { Task { await vm.applySort("progress") } }
                    } label: {
                        filterChipLabel(label: sortLabel, icon: "arrow.up.arrow.down")
                    }
                    .buttonStyle(.plain)
                }

                // Format
                filterChip(label: formatLabel, icon: "doc.text") {
                    Menu {
                        Button("All")   { Task { await vm.applyFormat("all") } }
                        Button("EPUB")  { Task { await vm.applyFormat("EPUB") } }
                        Button("PDF")   { Task { await vm.applyFormat("PDF") } }
                        Button("Comics") { Task { await vm.applyFormat("COMICS") } }
                    } label: {
                        filterChipLabel(label: formatLabel, icon: "doc.text")
                    }
                    .buttonStyle(.plain)
                }

                // Genres
                NavigationLink {
                    BookshelfBrowseView(vm: vm, mode: .genres)
                } label: {
                    filterChipLabel(label: "Genres", icon: "tag.fill")
                }
                .buttonStyle(.plain)

                // Authors
                NavigationLink {
                    BookshelfBrowseView(vm: vm, mode: .authors)
                } label: {
                    filterChipLabel(label: "Authors", icon: "person.2.fill")
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private func filterChip<Content: View>(label: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        content()
    }

    private func filterChipLabel(label: String, icon: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(label)
                .font(.system(size: 12, weight: .semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(BookshelfTheme.surface)
        .clipShape(Capsule())
        .overlay(Capsule().stroke(BookshelfTheme.border, lineWidth: 1))
    }

    private var sortLabel: String {
        switch vm.sortBy {
        case "title": return "By Title"
        case "year": return "By Year"
        case "progress": return "By Progress"
        default: return "Recent"
        }
    }

    private var formatLabel: String {
        switch vm.formatFilter {
        case "EPUB": return "EPUB"
        case "PDF": return "PDF"
        case "COMICS": return "Comics"
        default: return "All"
        }
    }

    // MARK: - Search Results

    @ViewBuilder
    private var searchResultsView: some View {
        if vm.isSearching {
            loadingView
        } else if vm.searchResults.isEmpty {
            VStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 40, weight: .light))
                    .foregroundStyle(BookshelfTheme.dimText)
                Text("No results for \"\(vm.searchQuery)\"")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BookshelfTheme.mutedText)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .bookshelfBackground()
        } else {
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                    ForEach(vm.searchResults) { book in
                        NavigationLink {
                            BookshelfBookDetailView(
                                bookId: book.bookID,
                                server: server,
                                downloadManager: downloadManager
                            )
                        } label: {
                            BookshelfBookCard(book: book, client: vm.client)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .scrollContentBackground(.hidden)
            .bookshelfBackground()
        }
    }

    // MARK: - States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView().controlSize(.large).tint(BookshelfTheme.accent)
            Text("Loading library…")
                .font(.system(size: 14))
                .foregroundStyle(BookshelfTheme.mutedText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 48, weight: .light))
                .foregroundStyle(BookshelfTheme.accent)
            VStack(spacing: 8) {
                Text("Connection Error")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(.white)
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .multilineTextAlignment(.center)
            }
            Button { Task { await vm.loadHome() } } label: {
                Text("Retry")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(BookshelfTheme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    // MARK: - Toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        #if !os(macOS)
        ToolbarItem(placement: .cancellationAction) {
            EmptyView()
        }
        #endif
        if downloadManager.hasActiveDownloads {
            ToolbarItem(placement: .primaryAction) {
                DownloadIndicator(downloadManager: downloadManager)
            }
        }
    }

    // MARK: - Grid

    private var gridColumns: [GridItem] {
        #if os(macOS)
        [GridItem(.adaptive(minimum: 140, maximum: 170), spacing: 14)]
        #else
        [GridItem(.adaptive(minimum: 100, maximum: 130), spacing: 10)]
        #endif
    }

    private var gridSpacing: CGFloat {
        #if os(macOS)
        20
        #else
        16
        #endif
    }
}

// MARK: - Browse View (Genres & Authors)

struct BookshelfBrowseView: View {
    let vm: BookshelfViewModel
    let mode: BrowseMode
    @State private var selectedGenre: BookshelfGenre?
    @State private var selectedAuthor: BookshelfAuthor?
    @Environment(\.modelContext) private var modelContext

    enum BrowseMode { case genres, authors }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                if mode == .genres {
                    genreList
                } else {
                    authorList
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
        .navigationTitle(mode == .genres ? "Genres" : "Authors")
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .bookshelfNavBar()
        .task {
            if mode == .authors { await vm.loadAuthors() }
        }
        .navigationDestination(isPresented: .constant(selectedGenre != nil)) {
            if let g = selectedGenre {
                BookshelfBookListView(vm: vm, title: g.name) {
                    await vm.loadBooksByGenre(genre: g)
                }
            }
        }
        .navigationDestination(isPresented: .constant(selectedAuthor != nil)) {
            if let a = selectedAuthor {
                BookshelfBookListView(vm: vm, title: a.fullName) {
                    await vm.loadBooksByAuthor(author: a)
                }
            }
        }
    }

    @ViewBuilder
    private var genreList: some View {
        ForEach(vm.genres) { genre in
            Button {
                selectedGenre = genre
            } label: {
                HStack {
                    Image(systemName: "tag.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(BookshelfTheme.accent)
                        .frame(width: 36, height: 36)
                        .background(BookshelfTheme.accent.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))

                    Text(genre.name)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)

                    Spacer()

                    if let count = genre.book_count {
                        Text("\(count)")
                            .font(.system(size: 12))
                            .foregroundStyle(BookshelfTheme.dimText)
                    }

                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(BookshelfTheme.dimText)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(BookshelfTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(BookshelfTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var authorList: some View {
        ForEach(vm.authors) { author in
            Button {
                selectedAuthor = author
            } label: {
                HStack {
                    Image(systemName: "person.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(BookshelfTheme.accent)
                        .frame(width: 36, height: 36)
                        .background(BookshelfTheme.accent.opacity(0.12))
                        .clipShape(Circle())

                    Text(author.fullName)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white)

                    Spacer()

                    if let count = author.book_count {
                        Text("\(count) books")
                            .font(.system(size: 12))
                            .foregroundStyle(BookshelfTheme.dimText)
                    }

                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(BookshelfTheme.dimText)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .background(BookshelfTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(BookshelfTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Browse Book List View

struct BookshelfBookListView: View {
    let vm: BookshelfViewModel
    let title: String
    let loadAction: () async -> Void
    @Environment(\.modelContext) private var modelContext
    @State private var downloadManager = DownloadManager()

    var body: some View {
        Group {
            if vm.isLoadingBrowse && vm.browseBooks.isEmpty {
                ProgressView().tint(BookshelfTheme.accent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVGrid(columns: gridColumns, spacing: gridSpacing) {
                        ForEach(vm.browseBooks) { book in
                            NavigationLink {
                                BookshelfBookDetailView(
                                    bookId: book.bookID,
                                    server: vm.server,
                                    downloadManager: downloadManager
                                )
                            } label: {
                                BookshelfBookCard(book: book, client: vm.client)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(16)
                }
                .scrollContentBackground(.hidden)
            }
        }
        .bookshelfBackground()
        .navigationTitle(title)
        #if !os(macOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .bookshelfNavBar()
        .task { await loadAction() }
        .environment(downloadManager)
    }

    private var gridColumns: [GridItem] {
        #if os(macOS)
        [GridItem(.adaptive(minimum: 140, maximum: 170), spacing: 14)]
        #else
        [GridItem(.adaptive(minimum: 100, maximum: 130), spacing: 10)]
        #endif
    }

    private var gridSpacing: CGFloat {
        #if os(macOS)
        20
        #else
        16
        #endif
    }
}

// MARK: - Book Card (Bookshelf API)

struct BookshelfBookCard: View {
    let book: BookshelfBook
    let client: NetworkClient
    @State private var isHovered = false
    @State private var coverData: Data?
    @State private var loadingCover = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            coverView
            titleView
        }
        .padding(4)
        .task { await loadCover() }
    }

    private var coverView: some View {
        Color.clear
            .aspectRatio(3/4, contentMode: .fit)
            .overlay {
                ZStack(alignment: .bottom) {
                    coverImage
                    if let pct = book.book_progress_percentage, pct > 0 {
                        GeometryReader { geo in
                            VStack(spacing: 0) {
                                Spacer()
                                ZStack(alignment: .leading) {
                                    Rectangle().fill(Color.black.opacity(0.5)).frame(height: 3)
                                    Rectangle().fill(BookshelfTheme.accent)
                                        .frame(width: geo.size.width * (pct / 100), height: 3)
                                }
                            }
                        }
                        .allowsHitTesting(false)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous))
            .shadow(color: BookshelfTheme.coverShadow, radius: 8, y: 4)
            .overlay(
                RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius)
                    .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
            )
            .scaleEffect(isHovered ? 1.03 : 1.0)
            .animation(.easeInOut(duration: 0.18), value: isHovered)
            .onHover { isHovered = $0 }
    }

    @ViewBuilder
    private var coverImage: some View {
        if let data = coverData, let img = platformImage(from: data) {
            img.resizable().scaledToFill()
        } else if loadingCover {
            BookshelfTheme.surface.overlay { ProgressView().controlSize(.small).tint(BookshelfTheme.mutedText) }
        } else {
            BookshelfTheme.surface.overlay {
                Image(systemName: "book.closed.fill")
                    .font(.system(size: 24))
                    .foregroundStyle(BookshelfTheme.dimText)
            }
        }
    }

    private var titleView: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(book.displayTitle)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
                .foregroundStyle(isHovered ? BookshelfTheme.accent : .white)
                .animation(.easeInOut(duration: 0.15), value: isHovered)

            Text(book.publishYear.map(String.init) ?? "N/A")
                .font(.system(size: 11))
                .foregroundStyle(BookshelfTheme.mutedText)
        }
    }

    private func loadCover() async {
        guard let url = client.coverURL(for: book) else { loadingCover = false; return }
        do {
            coverData = try await client.downloadImageData(from: url.absoluteString)
        } catch {}
        loadingCover = false
    }

    #if os(macOS)
    private func platformImage(from data: Data) -> Image? {
        NSImage(data: data).map { Image(nsImage: $0) }
    }
    #else
    private func platformImage(from data: Data) -> Image? {
        UIImage(data: data).map { Image(uiImage: $0) }
    }
    #endif
}

// MARK: - Continue Reading Card (Bookshelf API)

struct BookshelfContinueCard: View {
    let book: BookshelfBook
    let client: NetworkClient
    @State private var isHovered = false
    @State private var coverData: Data?
    @State private var loadingCover = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .bottom) {
                coverImage
                    .frame(width: 90, height: 135)
                    .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius, style: .continuous))
                    .shadow(color: BookshelfTheme.coverShadow, radius: 6, y: 3)
                    .overlay(
                        RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius)
                            .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
                    )
                    .scaleEffect(isHovered ? 1.04 : 1.0)
                    .animation(.easeInOut(duration: 0.18), value: isHovered)

                if let pct = book.book_progress_percentage, pct > 0 {
                    ZStack(alignment: .leading) {
                        Rectangle().fill(Color.black.opacity(0.5)).frame(width: 90, height: 3)
                        Rectangle().fill(BookshelfTheme.accent)
                            .frame(width: 90 * (pct / 100), height: 3)
                    }
                    .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.coverRadius))
                }
            }
            .onHover { isHovered = $0 }

            VStack(alignment: .leading, spacing: 2) {
                Text(book.displayTitle)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                .truncationMode(.tail)
                    .frame(width: 90, alignment: .leading)
                    .foregroundStyle(isHovered ? BookshelfTheme.accent : .white)

                if let pct = book.book_progress_percentage {
                    Text("\(Int(pct))%")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(BookshelfTheme.accent)
                }
            }
        }
        .task { await loadCover() }
    }

    @ViewBuilder
    private var coverImage: some View {
        if let data = coverData, let img = platformImage(from: data) {
            img.resizable().aspectRatio(contentMode: .fill)
        } else if loadingCover {
            BookshelfTheme.surface.overlay { ProgressView().controlSize(.small).tint(BookshelfTheme.mutedText) }
        } else {
            BookshelfTheme.surface.overlay {
                Image(systemName: "book.closed.fill").font(.system(size: 20)).foregroundStyle(BookshelfTheme.dimText)
            }
        }
    }

    private func loadCover() async {
        guard let url = client.coverURL(for: book) else { loadingCover = false; return }
        do { coverData = try await client.downloadImageData(from: url.absoluteString) } catch {}
        loadingCover = false
    }

    #if os(macOS)
    private func platformImage(from data: Data) -> Image? { NSImage(data: data).map { Image(nsImage: $0) } }
    #else
    private func platformImage(from data: Data) -> Image? { UIImage(data: data).map { Image(uiImage: $0) } }
    #endif
}
