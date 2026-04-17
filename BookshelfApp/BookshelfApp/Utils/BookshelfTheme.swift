import SwiftUI

// MARK: - Design System
// Mirrors the web app's Plex-like dark aesthetic:
// Background: #001e38 | Surface: #002244 | Accent: #f1184c

enum BookshelfTheme {

    // MARK: - Colors
    static let background     = Color(red: 0/255,   green: 30/255,  blue: 56/255)   // #001e38
    static let surface        = Color(red: 0/255,   green: 34/255,  blue: 68/255)   // #002244
    static let surfaceRaised  = Color(red: 0/255,   green: 43/255,  blue: 79/255)   // #002b4f
    static let accent         = Color(red: 241/255, green: 24/255,  blue: 76/255)   // #f1184c
    static let accentGlow     = Color(red: 241/255, green: 24/255,  blue: 76/255).opacity(0.25)
    static let border         = Color.white.opacity(0.07)
    static let borderHover    = Color(red: 241/255, green: 24/255,  blue: 76/255).opacity(0.4)
    static let dimText        = Color.white.opacity(0.35)
    static let mutedText      = Color.white.opacity(0.55)

    // MARK: - Shape
    static let coverRadius: CGFloat = 3
    static let panelRadius: CGFloat = 10
    static let badgeRadius: CGFloat = 4

    // MARK: - Shadow
    static let coverShadow  = Color.black.opacity(0.55)
    static let panelShadow  = Color.black.opacity(0.3)
}

// MARK: - View Modifiers

extension View {

    /// Full-screen dark background with forced dark color scheme
    func bookshelfBackground() -> some View {
        self
            .background(BookshelfTheme.background.ignoresSafeArea())
            .preferredColorScheme(.dark)
    }

    /// Raised surface card style
    func bookshelfSurface(radius: CGFloat = BookshelfTheme.panelRadius) -> some View {
        self
            .background(BookshelfTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(BookshelfTheme.border, lineWidth: 1)
            )
    }

    /// Dark navigation bar styling (iOS/iPadOS only; no-op on macOS)
    @ViewBuilder
    func bookshelfNavBar() -> some View {
        #if os(macOS)
        self
        #else
        self
            .toolbarBackground(BookshelfTheme.background.opacity(0.95), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
        #endif
    }
}

// MARK: - Accent badge

struct FormatBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(BookshelfTheme.accent.opacity(0.15))
            .foregroundStyle(BookshelfTheme.accent)
            .clipShape(RoundedRectangle(cornerRadius: BookshelfTheme.badgeRadius))
            .overlay(
                RoundedRectangle(cornerRadius: BookshelfTheme.badgeRadius)
                    .stroke(BookshelfTheme.accent.opacity(0.3), lineWidth: 1)
            )
    }
}

// MARK: - Section header

struct BookshelfSectionHeader: View {
    let title: String

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: 11, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(BookshelfTheme.mutedText)
    }
}
