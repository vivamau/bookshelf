import SwiftUI
import SwiftData

struct ServerListView: View {
    @Query(sort: \ServerConfig.dateAdded) private var servers: [ServerConfig]
    @Environment(\.modelContext) private var modelContext
    @Binding var selectedServer: ServerConfig?
    @State private var showingAddSheet = false
    @State private var serverToEdit: ServerConfig?

    var body: some View {
        Group {
            if servers.isEmpty {
                emptyState
            } else {
                serverList
            }
        }
        .bookshelfBackground()
        .navigationTitle("Servers")
        .bookshelfNavBar()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddSheet = true
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(BookshelfTheme.accent)
                }
            }
        }
        .sheet(isPresented: $showingAddSheet) { AddServerView() }
        .sheet(item: $serverToEdit) { EditServerView(server: $0) }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "server.rack")
                .font(.system(size: 52, weight: .light))
                .foregroundStyle(BookshelfTheme.dimText)

            VStack(spacing: 8) {
                Text("No Servers")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                Text("Add a Bookshelf or OPDS server\nto start browsing your library.")
                    .font(.system(size: 14))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .multilineTextAlignment(.center)
            }

            Button {
                showingAddSheet = true
            } label: {
                Text("Add Server")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 11)
                    .background(BookshelfTheme.accent)
                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .bookshelfBackground()
    }

    // MARK: - Server List

    private var serverList: some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                ForEach(servers) { server in
                    ServerRow(server: server)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedServer = server }
                        .contextMenu {
                            Button("Edit") { serverToEdit = server }
                            Button("Delete", role: .destructive) { deleteServer(server) }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button("Delete", role: .destructive) { deleteServer(server) }
                            Button("Edit") { serverToEdit = server }.tint(BookshelfTheme.accent)
                        }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollContentBackground(.hidden)
        .bookshelfBackground()
    }

    private func deleteServer(_ server: ServerConfig) {
        if selectedServer?.id == server.id { selectedServer = nil }
        modelContext.delete(server)
        try? modelContext.save()
    }
}

// MARK: - Server Row

struct ServerRow: View {
    let server: ServerConfig
    @State private var isHovered = false

    private var isBookshelf: Bool { server.type == .bookshelf }

    var body: some View {
        HStack(spacing: 14) {
            // Icon
            Image(systemName: isBookshelf ? "books.vertical.fill" : "antenna.radiowaves.left.and.right")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(isBookshelf ? BookshelfTheme.accent : Color.orange)
                .frame(width: 44, height: 44)
                .background(
                    (isBookshelf ? BookshelfTheme.accent : Color.orange).opacity(0.12)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            // Info
            VStack(alignment: .leading, spacing: 3) {
                Text(server.name)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                Text(server.baseURL)
                    .font(.system(size: 12))
                    .foregroundStyle(BookshelfTheme.mutedText)
                    .lineLimit(1)
                Text(server.type.displayName)
                    .font(.system(size: 10, weight: .bold))
                    .tracking(0.5)
                    .foregroundStyle(isBookshelf ? BookshelfTheme.accent : Color.orange)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(BookshelfTheme.dimText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(isHovered ? BookshelfTheme.surfaceRaised : BookshelfTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isHovered ? BookshelfTheme.borderHover : BookshelfTheme.border, lineWidth: 1)
        )
        .animation(.easeInOut(duration: 0.15), value: isHovered)
        .onHover { isHovered = $0 }
    }
}
