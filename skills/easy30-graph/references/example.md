# Worked example: linear algebra (course language: it)

Chain of concepts and edges (A -> B means A is a prerequisite of B):

```
Vettore -> Combinazione lineare -> Span -> Base
                  \-> Indipendenza lineare -> Base -> Dimensione -> Rango -> Teorema di Rouché-Capelli
Matrice -> Rango
Sistema lineare -> Teorema di Rouché-Capelli
```

Note: no edge Vettore -> Span (transitive via Combinazione lineare). Span and Indipendenza lineare both depend on Combinazione lineare; Base depends on both.

## Batch call

```json
upsert_concepts({
  "course": "algebra-lineare",
  "concepts": [
    {
      "title": "Vettore",
      "importance": 2,
      "question": "Cos'è un vettore di $\\mathbb{R}^n$ e quali operazioni si definiscono su di essi?",
      "answer": "Un vettore di $\\mathbb{R}^n$ è una $n$-upla ordinata $v=(v_1,\\dots,v_n)$. Somma componente per componente e prodotto per uno scalare $\\lambda v=(\\lambda v_1,\\dots,\\lambda v_n)$.\n\nEsempio: $(1,2)+3\\,(0,1)=(1,5)$. (appunti §1.1)"
    },
    {
      "title": "Combinazione lineare",
      "importance": 3,
      "requires": ["Vettore"],
      "question": "Definisci la combinazione lineare di vettori. Il vettore $(3,5)$ è combinazione lineare di $(1,1)$ e $(0,1)$?",
      "answer": "Dati $v_1,\\dots,v_k$ e scalari $a_1,\\dots,a_k$, il vettore $a_1v_1+\\dots+a_kv_k$ è una combinazione lineare.\n\nEsempio: $(3,5)=3(1,1)+2(0,1)$, quindi sì. (appunti §1.2)"
    },
    {
      "title": "Span",
      "importance": 2,
      "requires": ["Combinazione lineare"],
      "question": "Definisci lo span di un insieme di vettori e dimostra che è un sottospazio.",
      "answer": "$\\mathrm{Span}(v_1,\\dots,v_k)$ è l'insieme di tutte le combinazioni lineari. È un sottospazio: contiene $0$ (coefficienti nulli) ed è chiuso per somma e prodotto per scalari perché somma di combinazioni lineari è una combinazione lineare. (appunti §1.3)"
    },
    {
      "title": "Indipendenza lineare",
      "importance": 3,
      "requires": ["Combinazione lineare"],
      "question": "Quando $v_1,\\dots,v_k$ sono linearmente indipendenti? Come si verifica in pratica?",
      "answer": "Lo sono se $a_1v_1+\\dots+a_kv_k=0 \\Rightarrow a_1=\\dots=a_k=0$. In pratica: si imposta il sistema omogeneo e si riduce a scala; indipendenti se non ci sono variabili libere. (appunti §1.4)"
    },
    {
      "title": "Base",
      "importance": 3,
      "requires": ["Span", "Indipendenza lineare"],
      "question": "Cos'è una base di uno spazio vettoriale? Perché ogni vettore ha coordinate uniche?",
      "answer": "Una base è un insieme di vettori linearmente indipendenti che generano lo spazio. Unicità: se $v=\\sum a_ib_i=\\sum a_i'b_i$ allora $\\sum(a_i-a_i')b_i=0$, da cui $a_i=a_i'$ per indipendenza. (appunti §1.5)"
    },
    {
      "title": "Dimensione",
      "importance": 3,
      "requires": ["Base"],
      "question": "Enuncia il teorema sull'invarianza del numero di elementi di una base e definisci la dimensione.",
      "answer": "Tutte le basi di $V$ hanno lo stesso numero di elementi (idea: lemma di Steinitz, un insieme indipendente non supera un insieme di generatori). Tale numero è $\\dim V$. Es. $\\dim\\mathbb{R}^n=n$. (appunti §1.6)"
    }
  ]
})
```

Later batch: `Matrice` (root), `Sistema lineare` (requires Matrice? no: requires Vettore only if the course introduces it that way), `Rango` (requires Dimensione, Matrice), `Teorema di Rouché-Capelli` (requires Rango, Sistema lineare).

## Report shape

```
Course algebra-lineare: 38 concepts (31 new, 7 updated), 44 edges.
Roots: Vettore, Matrice, Insieme. Deepest chain (7): Vettore -> ... -> Rouché-Capelli.
Skipped: 1 cyclic edge (Determinante <-> Rango), resolved by dropping Rango as prerequisite of Determinante.
Unclear: syllabus lists "Forme quadratiche" but no source covers it; not added.
```
