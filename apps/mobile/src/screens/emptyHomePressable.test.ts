import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

export function checkEmptyHomePressables(source: string): { violations: string[] } {
  // Encontra todas as tags de abertura <Pressable ... >
  const pressableMatches = [...source.matchAll(/<Pressable\b([^>]*?)>/gs)];
  const violations: string[] = [];

  for (const m of pressableMatches) {
    const props = m[1] ?? "";
    const isButton = /accessibilityRole\s*=\s*["']button["']/.test(props);
    if (!isButton) continue;

    const hasOnPress = /\bonPress\s*=/.test(props);
    if (!hasOnPress) {
      violations.push(`Pressable com accessibilityRole="button" sem onPress: ${props.trim()}`);
    }
  }

  return { violations };
}

describe("emptyHomePressable", () => {
  it("todo Pressable com accessibilityRole='button' em EmptyHome.tsx tem onPress", () => {
    const filePath = join(__dirname, "EmptyHome.tsx");
    const source = readFileSync(filePath, "utf8");
    const { violations } = checkEmptyHomePressables(source);

    expect(violations).toEqual([]);
  });

  it("falha no código anterior à correção onde o botão Cadastrar meu ponto não tinha onPress", () => {
    const previousSource = `
        {/* Cartão Comece pelo ponto onde você pega o ônibus */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[type.title, { color: colors.text }]}>{t("home.empty.title")}</Text>
          <Text style={[type.body, { color: colors.textSecondary }]}>{t("home.empty.body")}</Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[type.bodyStrong, { color: colors.onAccent }]}>{t("home.empty.action")}</Text>
          </Pressable>
        </View>
`;
    const { violations } = checkEmptyHomePressables(previousSource);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toContain('accessibilityRole="button"');
  });
});
