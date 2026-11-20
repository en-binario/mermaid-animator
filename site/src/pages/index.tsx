import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

const SAMPLE = `sequenceDiagram
    %% @animator speed=1.25 future=ghosted camera=follow
    %% @chapter "Place order"
    %% @caption "The customer confirms the basket."
    Customer->>+Shop: Confirm order
    %% @pause 1.5s
    Shop-->>-Customer: Confirmed`;

const FORMATS = [
  { name: 'GIF', text: 'Loops in any chat, issue or slide. Global palette, optional dithering and transparency.' },
  { name: 'WebM / MP4', text: 'Video rendered frame-exact in a background worker, with captions burned in.' },
  { name: 'Animated SVG', text: 'Plays as an image in a GitHub README, with a light and dark pair. No scripts.' },
  { name: 'HTML player', text: 'One offline file with transport, keyboard control, chapters and step links.' },
  { name: 'SVG / PNG', text: 'The current frame, self-contained, at 1×, 2× or 3×, or copied to the clipboard.' },
];

function Screen({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <figure className={styles.window}>
      <img
        src={useBaseUrl(`/img/screens/${src}`)}
        alt={alt}
        width={1280}
        height={760}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
      />
    </figure>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title="Animate your Mermaid diagrams in VS Code"
      description="Mermaid Animator plays the Mermaid diagrams already in your repository as elegant, navigable animations in VS Code, and exports them as GIF, video, animated SVG or an HTML player."
    >
      <header className={styles.hero}>
        <div className="container">
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>VS Code extension · Mermaid 12</p>
            <Heading as="h1" className={styles.title}>
              The diagrams already in your repository, animated.
            </Heading>
            <p className={styles.lead}>
              Mermaid Animator plays your Mermaid diagrams as elegant, navigable animations, in <code>.mmd</code>{' '}
              files and in Markdown. Step through a flow, switch to a live service map, narrate it, present it, and
              export it as a GIF, a video or an animated SVG for your README.
            </p>
            <div className={styles.actions}>
              <Link className="button button--primary button--lg" to="/docs/getting-started/">
                Get started
              </Link>
              <Link className="button button--secondary button--lg" href="https://github.com/en-binario/mermaid-animator">
                View on GitHub
              </Link>
            </div>
          </div>
          <Screen
            src="sequence.png"
            alt="The animator panel playing a checkout sequence diagram: step 4 of 11 inside a retry loop, with the inspector, the minimap and the transport"
            eager
          />
        </div>
      </header>

      <main>
        <section className={styles.highlights} aria-label="Highlights">
          <div className="container">
            <ul className={styles.highlightList}>
              <li>
                <strong>Nothing to change</strong>
                <span>Works on the Mermaid you already have, in Markdown and .mmd files.</span>
              </li>
              <li>
                <strong>Live while you type</strong>
                <span>Edits redraw at once and the panel keeps your step. Errors keep the last good drawing.</span>
              </li>
              <li>
                <strong>Every diagram type</strong>
                <span>Sequence diagrams natively; flowcharts and the rest with an ordered reveal.</span>
              </li>
              <li>
                <strong>Private</strong>
                <span>No network requests. Your diagrams never leave your machine.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.feature}>
          <div className={`container ${styles.featureGrid}`}>
            <div className={styles.featureText}>
              <Heading as="h2">The same flow as a live service map</Heading>
              <p>
                Press <kbd>T</kbd> and participants become nodes, messages merge into weighted edges, and every step
                sends a pulse along its edge. Switching views morphs one into the other without losing your place.
              </p>
              <Link to="/docs/guide/views/">Sequence, topology, split →</Link>
            </div>
            <Screen
              src="topology.png"
              alt="The topology view of the checkout flow: Customer, Web App, Payments and Ledger as nodes, with the Ack message pulsing between Ledger and Payments"
            />
          </div>
        </section>

        <section className={`${styles.feature} ${styles.band}`}>
          <div className={`container ${styles.featureGrid} ${styles.reverse}`}>
            <div className={styles.featureText}>
              <Heading as="h2">Both views on one timeline</Heading>
              <p>
                Split view (<kbd>S</kbd>) shows the sequence and the topology side by side, each with its own camera.
                Hover an element to highlight its counterpart. The inspector tells you where you are: the step, its
                loop iteration, its chapter and its line in the source.
              </p>
              <Link to="/docs/guide/playback/">Playing a diagram →</Link>
            </div>
            <Screen
              src="split.png"
              alt="Split view: the sequence diagram on the left and its topology on the right, both at step 5, with the inspector open"
            />
          </div>
        </section>

        <section className={styles.feature}>
          <div className={`container ${styles.featureGrid}`}>
            <div className={styles.featureText}>
              <Heading as="h2">Narrate it with Mermaid comments</Heading>
              <p>
                Captions, chapters, pauses and per-diagram settings are <code>%% @</code> comments, so GitHub and
                every other renderer ignore them. Prefer a clean source? Keep them in a sidecar file instead. Then
                press <kbd>P</kbd> to present, with title cards, a clicker and a laser pointer.
              </p>
              <Link to="/docs/authoring/annotations/">Annotations →</Link>
            </div>
            <div className={styles.code}>
              <CodeBlock language="text" title="checkout.md">
                {'```mermaid\n' + SAMPLE + '\n```'}
              </CodeBlock>
            </div>
          </div>
        </section>

        <section className={`${styles.feature} ${styles.band}`}>
          <div className="container">
            <Heading as="h2" className={styles.center}>
              Share it anywhere
            </Heading>
            <p className={`${styles.center} ${styles.muted}`}>
              The export sheet previews the result with its duration and file size before you save.
            </p>
            <ul className={styles.formats}>
              {FORMATS.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}</strong>
                  <span>{f.text}</span>
                </li>
              ))}
            </ul>
            <p className={styles.center}>
              <Link to="/docs/guide/export/">Export and share →</Link>
            </p>
          </div>
        </section>

        <section className={styles.cta}>
          <div className="container">
            <Heading as="h2">Try it on your diagrams</Heading>
            <p className={styles.muted}>Free and open source under the MIT License. Requires VS Code 1.95 or later.</p>
            <Link className="button button--primary button--lg" to="/docs/getting-started/">
              Install Mermaid Animator
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}
