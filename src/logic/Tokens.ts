export type TokenType = 'class' | 'field' | 'method' | 'parameter' | 'local';

interface BaseToken {
    // The number of characters from the start of the source
    start: number;
    // The length of the token in characters
    length: number;
    // The name of the class this token represents
    className: string;
    // Whether this token is a declaration or a reference
    declaration: boolean;
}

interface MemberToken extends BaseToken {
    type: 'field' | 'method';
    // The member name
    name: string;
    // The member descriptor
    descriptor: string;
}

interface NonMethodToken extends BaseToken {
    type: 'class' | 'parameter' | 'local';
}

export type Token = MemberToken | NonMethodToken;