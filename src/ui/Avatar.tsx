// The learner's account picture: their photo when the account has one, else their initial on the royal tint.
// Plain React Native Image (cached by the platform's HTTP cache, so a photo seen once shows offline too);
// when the image cannot load, the initial takes its place.
import { UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { Image, View } from 'react-native';

import { initialOf } from '@/features/avatar';
import { Txt } from '@/ui/Text';
import { useTheme } from '@/ui/theme';

export function Avatar({ uri, name, email, size = 40 }: { uri: string | null; name?: string | null; email?: string | null; size?: number }) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  const initial = initialOf(name, email);
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (uri && !failed) {
    return <Image source={{ uri }} onError={() => setFailed(true)} style={[round, { backgroundColor: c.royalTint }]} accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[round, { backgroundColor: c.royalTint, alignItems: 'center', justifyContent: 'center' }]}>
      {initial ? (
        <Txt variant="bodyStrong" style={{ color: c.royal, fontSize: size * 0.45, lineHeight: size * 0.55 }}>
          {initial}
        </Txt>
      ) : (
        <UserRound size={size * 0.5} color={c.royal} />
      )}
    </View>
  );
}
