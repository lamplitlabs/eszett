import Svg, { G, Path, Rect } from 'react-native-svg';

// The ß of Vollkorn Bold, the app's German typeface, as drawn in assets/images (the same outline, so the
// mark in the app matches the icon on the home screen).
const ESZETT =
  'M110 373Q98 378 73.5 381.5Q49 385 31 385Q31 402 34 417.5Q37 433 44 448H110V482Q110 542 129 586Q148 630 182 659Q216 688 260.5 702Q305 716 357 716Q427 716 470.5 697.5Q514 679 535 648.5Q556 618 556 583Q556 550 544 527.5Q532 505 514.5 490Q497 475 479.5 462.5Q462 450 450 438Q438 426 438 409Q438 388 453.5 373Q469 358 493 345Q517 332 544 317.5Q571 303 595 283Q619 263 634.5 234Q650 205 650 162Q650 122 633 90.5Q616 59 586.5 37Q557 15 521 3.5Q485 -8 447 -8Q400 -8 365.5 -0.5Q331 7 305 24Q308 39 308.5 62.5Q309 86 309 110.5Q309 135 308 152Q321 158 343.5 161Q366 164 381 164Q387 105 402.5 77.5Q418 50 457 50Q478 50 494 67.5Q510 85 510 113Q510 144 489.5 164.5Q469 185 438.5 202Q408 219 377.5 237.5Q347 256 326.5 283Q306 310 306 352Q306 387 319.5 408Q333 429 353 443.5Q373 458 393 471.5Q413 485 426.5 504Q440 523 440 554Q440 580 426.5 602Q413 624 388.5 638Q364 652 331 652Q305 652 287 641.5Q269 631 260.5 602.5Q252 574 252 519V-1Q231 0 205 0Q179 0 158 0Q120 0 89 -0.5Q58 -1 36 -3Q36 15 37.5 30.5Q39 46 43 58Q70 60 84.5 68Q99 76 104.5 96Q110 116 110 154Z';

export const MARK_BLUE = '#2442C6';

/**
 * The Eszett mark: a Königsblau square and a white ß. The brand colours stay fixed in both themes, like the
 * icon; `lit` dims the letter while the tutor model is not there to answer.
 */
export function AppMark({ size = 36, lit = true }: { size?: number; lit?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Eszett">
      <Rect width={100} height={100} rx={22} fill={MARK_BLUE} />
      <G transform="translate(19.9 82.29) scale(0.0884 -0.0884)" opacity={lit ? 1 : 0.45}>
        <Path d={ESZETT} fill="#FFFFFF" />
      </G>
    </Svg>
  );
}
