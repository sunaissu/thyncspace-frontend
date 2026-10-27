import Image from "next/image";

export default function MakerCredit() {
  return <span className="maker-credit">
    <span>Made by</span>
    <Image className="maker-wordmark maker-light" src="/brand/sunaissu-light.svg" alt="Sunaissu" width={84} height={27} />
    <Image className="maker-wordmark maker-dark" src="/brand/sunaissu-dark.svg" alt="Sunaissu" width={84} height={27} />
    <Image className="maker-personal maker-light" src="/brand/bg-light.svg" alt="bg_" width={24} height={12} />
    <Image className="maker-personal maker-dark" src="/brand/bg-dark.svg" alt="bg_" width={24} height={12} />
  </span>;
}
